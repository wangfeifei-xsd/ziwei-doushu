# H2 Database Engine

- Version: **2.5.252** (bundled; no runtime download)
- Upstream: https://github.com/h2database/h2database/tree/version-2.5.252
- Artifact: https://repo.maven.apache.org/maven2/com/h2database/h2/2.5.252/h2-2.5.252.jar
- SHA-256: `90b11dc413da82070ef15fc943282c1408e6ffd34fa68998335fea8603b5ff20`
- License: MPL-2.0 OR EPL-1.0; see `LICENSE.txt`.

`server/h2/ProfileStore.java` runs the embedded driver with Java 17+ JDK's source
launcher. Next.js communicates through stdin/stdout; no separate database service
or public H2 console is required. Application data is created in `data/ziwei.mv.db`,
or the directory specified by `H2_DATA_DIR`. Copy/back up that directory while the
application is stopped. The driver and bridge are also included in Next.js's
standalone server output.
