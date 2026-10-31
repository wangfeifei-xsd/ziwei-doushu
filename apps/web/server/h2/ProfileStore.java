import java.io.*;
import java.nio.charset.StandardCharsets;
import java.sql.*;
import java.util.Base64;

/** Embedded H2, accessed only over this process's stdin/stdout (no public database port). */
class ProfileStore {
    private static String profile(ResultSet rows) throws SQLException {
        return "{\"id\":\"" + rows.getString("id") + "\",\"form\":"
            + rows.getString("form_data") + ",\"savedAt\":" + rows.getLong("saved_at") + "}";
    }

    private static String execute(Connection db, String[] request) throws SQLException {
        String action = request[1];
        String id = request[2];
        if (!id.isEmpty() && !id.matches("[a-f0-9]{64}")) throw new IllegalArgumentException();
        switch (action) {
            case "list":
                try (PreparedStatement query = db.prepareStatement(
                    "SELECT id, form_data, saved_at FROM birth_profiles ORDER BY saved_at DESC, id")) {
                    try (ResultSet rows = query.executeQuery()) {
                        StringBuilder result = new StringBuilder("[");
                        while (rows.next()) {
                            if (result.length() > 1) result.append(',');
                            result.append(profile(rows));
                        }
                        return result.append(']').toString();
                    }
                }
            case "save":
                String form = new String(Base64.getDecoder().decode(request[3]), StandardCharsets.UTF_8);
                try (PreparedStatement query = db.prepareStatement(
                    "MERGE INTO birth_profiles (id, form_data, saved_at) KEY (id) VALUES (?, ?, ?)")) {
                    query.setString(1, id);
                    query.setString(2, form);
                    query.setLong(3, System.currentTimeMillis());
                    query.executeUpdate();
                }
                // Read back the committed record using the same path as a later request.
                return execute(db, new String[] {request[0], "get", id});
            case "update":
                String targetId = request.length > 4 ? request[4] : "";
                if (!targetId.matches("[a-f0-9]{64}")) throw new IllegalArgumentException();
                // Archive IDs are hashes of normalized birth data. Replace both the
                // data and its ID atomically, without overwriting another archive.
                db.setAutoCommit(false);
                try {
                    try (PreparedStatement source = db.prepareStatement(
                        "SELECT id FROM birth_profiles WHERE id = ? FOR UPDATE")) {
                        source.setString(1, id);
                        try (ResultSet rows = source.executeQuery()) {
                            if (!rows.next()) {
                                db.rollback();
                                return "null";
                            }
                        }
                    }
                    if (!targetId.equals(id) && !execute(db, new String[] {request[0], "get", targetId}).equals("null")) {
                        db.rollback();
                        return "\"duplicate\"";
                    }
                    String updated = execute(db, new String[] {request[0], "save", targetId, request[3]});
                    if (!targetId.equals(id)) execute(db, new String[] {request[0], "delete", id});
                    db.commit();
                    return updated;
                } catch (SQLException | RuntimeException error) {
                    db.rollback();
                    throw error;
                } finally {
                    db.setAutoCommit(true);
                }
            case "get":
                try (PreparedStatement query = db.prepareStatement(
                    "SELECT id, form_data, saved_at FROM birth_profiles WHERE id = ?")) {
                    query.setString(1, id);
                    try (ResultSet rows = query.executeQuery()) {
                        return rows.next() ? profile(rows) : "null";
                    }
                }
            case "delete":
                try (PreparedStatement query = db.prepareStatement("DELETE FROM birth_profiles WHERE id = ?")) {
                    query.setString(1, id);
                    return query.executeUpdate() > 0 ? "true" : "false";
                }
            default:
                throw new IllegalArgumentException();
        }
    }

    public static void main(String[] args) throws Exception {
        // AUTO_SERVER lets development and production workers safely share the same file.
        // WRITE_DELAY=0 flushes a save before acknowledging it to the page.
        boolean readOnly = args.length > 1 && args[1].equals("--readonly");
        try (Connection db = DriverManager.getConnection(
                "jdbc:h2:file:" + args[0] + (readOnly ? ";IFEXISTS=TRUE;ACCESS_MODE_DATA=r" : ";AUTO_SERVER=TRUE;WRITE_DELAY=0"), "sa", "");
             BufferedReader input = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
             PrintWriter output = new PrintWriter(new OutputStreamWriter(System.out, StandardCharsets.UTF_8), true)) {
            if (!readOnly) try (Statement schema = db.createStatement()) {
                schema.execute("CREATE TABLE IF NOT EXISTS birth_profiles ("
                    + "id VARCHAR(64) PRIMARY KEY, form_data CLOB NOT NULL, saved_at BIGINT NOT NULL)");
            }
            output.println("READY");
            String line;
            while ((line = input.readLine()) != null) {
                String[] request = line.split("\t", -1);
                if (request.length < 3 || !request[0].matches("[0-9]+")) continue;
                try {
                    if (readOnly && !request[1].equals("list") && !request[1].equals("get")) throw new IllegalArgumentException();
                    output.println("{\"requestId\":" + request[0] + ",\"result\":" + execute(db, request) + "}");
                } catch (Exception error) {
                    System.err.println("H2 profile request failed: " + error.getClass().getSimpleName());
                    output.println("{\"requestId\":" + request[0] + ",\"error\":true}");
                }
            }
        }
    }
}
