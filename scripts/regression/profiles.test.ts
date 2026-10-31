import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { H2Database } from '../../lib/db/h2';
import { isProfileId, parseProfileForm, type BirthProfile } from '../../lib/ziwei/profiles';
import { formToBirthInfo } from '../../lib/ziwei/share';
import { generateChart } from '../../lib/ziwei/algorithm';

async function main() {
  const form = parseProfileForm({
    name: '测试档案「小王」\t\n\"\\😀', year: '2000', month: '01', day: '31',
    clockHour: '23', clockMinute: '30', unknownTime: false,
    province: '浙江省', city: '杭州市', longitude: 120.2, gender: 'female',
  });
  assert.equal(form.month, '1', 'leading zeros are normalized');
  for (const value of [null, [], {}, { ...form, year: '2020abc' },
    { ...form, month: '2', day: '30' }, { ...form, year: '1900', month: '2', day: '29' },
    { ...form, clockHour: '24' }, { ...form, clockMinute: '60' },
    { ...form, longitude: NaN }, { ...form, longitude: 181 },
    { ...form, gender: 'other' }, { ...form, unknownTime: 'false' }, { ...form, name: '王'.repeat(81) }]) {
    assert.throws(() => parseProfileForm(value), Error, `invalid form: ${JSON.stringify(value)}`);
  }
  const idFor = (input: typeof form) => createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const id = idFor(form);
  assert.ok(isProfileId(id));
  assert.ok(!isProfileId("' OR 1=1 --"));
  const directory = await mkdtemp(path.join(tmpdir(), 'ziwei-h2-profiles-'));
  let database = new H2Database(directory);
  try {
    assert.deepEqual(await database.request('list'), []);
    const saved = await database.request<BirthProfile>('save', id, JSON.stringify(form));
    assert.deepEqual(saved.form, form, 'Chinese, tabs, newlines and quotes survive storage');
    assert.equal(saved.id, id);
    assert.ok(saved.savedAt > 0);
    await Promise.all(Array.from({ length: 5 }, () => database.request('save', id, JSON.stringify(form))));
    assert.equal((await database.request<BirthProfile[]>('list')).length, 1, 'repeated saves use one record');
    const otherForm = { ...form, name: '同生日的另一个人' };
    const otherId = idFor(otherForm);
    await database.request('save', otherId, JSON.stringify(otherForm));
    assert.equal((await database.request<BirthProfile[]>('list')).length, 2, 'same birthday with a different name remains separate');

    // Multiple Next workers may open the same file at the same time.
    const secondWorker = new H2Database(directory);
    try {
      assert.deepEqual((await secondWorker.request<BirthProfile>('get', id)).form, form);
    } finally { await secondWorker.close(); }

    await database.close();
    assert.ok((await stat(path.join(directory, 'ziwei.mv.db'))).size > 0);
    database = new H2Database(directory);
    const restored = await database.request<BirthProfile>('get', id);
    assert.deepEqual(restored.form, form, 'archive remains readable after a full database restart');
    const info = formToBirthInfo(restored.form);
    assert.deepEqual([info.year, info.month, info.day, info.hour], [2000, 2, 1, 0], 'late Zi clock input is advanced once');
    assert.deepEqual(info.origInput, { year: 2000, month: 1, day: 31, clockHour: 23, clockMinute: 30 });
    assert.deepEqual(generateChart(info).birthInfo, generateChart(formToBirthInfo(form)).birthInfo);
    const unknown = formToBirthInfo({ ...form, unknownTime: true });
    assert.deepEqual([unknown.year, unknown.month, unknown.day, unknown.hour], [2000, 1, 31, 0]);
    const editedForm = parseProfileForm({ ...form, name: '修改后的档案', clockMinute: '45' });
    const editedId = idFor(editedForm);
    const edited = await database.request<BirthProfile>('update', id, JSON.stringify(editedForm), editedId);
    assert.equal(edited.id, editedId, 'editing uses the hash of the new normalized data');
    assert.deepEqual(edited.form, editedForm);
    assert.equal(await database.request('get', id), null, 'the old archive is replaced');
    assert.equal((await database.request<BirthProfile[]>('list')).length, 2, 'editing does not create an extra record');
    assert.equal(await database.request('update', editedId, JSON.stringify(otherForm), otherId), 'duplicate', 'editing cannot overwrite another archive');
    assert.deepEqual((await database.request<BirthProfile>('get', editedId)).form, editedForm, 'a rejected edit preserves the source');
    assert.deepEqual((await database.request<BirthProfile>('get', otherId)).form, otherForm, 'a rejected edit preserves the target');
    assert.equal((await database.request<BirthProfile>('update', editedId, JSON.stringify(editedForm), editedId)).id, editedId, 'an unchanged edit keeps one archive');
    assert.equal(await database.request('update', id, JSON.stringify(form), id), null, 'editing a deleted archive does not recreate it');
    await assert.rejects(database.request('update', editedId, JSON.stringify(form), 'invalid'), /无效/);
    await database.close();
    database = new H2Database(directory);
    assert.deepEqual((await database.request<BirthProfile>('get', editedId)).form, editedForm, 'edited data persists after restart');
    assert.deepEqual(formToBirthInfo(editedForm).origInput, { year: 2000, month: 1, day: 31, clockHour: 23, clockMinute: 45 }, 'editing preserves the original clock input');
    assert.equal(await database.request('delete', editedId), true);
    assert.equal(await database.request('get', editedId), null);
    assert.equal(await database.request('delete', editedId), false);
    assert.equal((await database.request<BirthProfile[]>('list')).length, 1, 'deletion affects only the selected archive');
    await assert.rejects(database.request('get', "' OR 1=1 --"), /无效/);
  } finally {
    await database.close();
    await rm(directory, { recursive: true, force: true });
  }
  console.log('✓ H2 档案回归通过：输入校验、中文读写、去重、多进程、重启持久化、原子编辑、重复保护、晚子时与删除。');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
