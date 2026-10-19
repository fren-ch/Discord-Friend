const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getCheckInPolicy, getNextCheckInAt } = require('../src/ai/checkInPolicy');

test('profile traits select timing without matching denied traits', () => {
  assert.equal(getCheckInPolicy({ personality: 'Friendly and curious' }).style, 'normal');
  assert.equal(getCheckInPolicy({ personality: 'Needy, clingy and affectionate' }).style, 'needy');
  assert.equal(getCheckInPolicy({ personality: 'An obsessive yandere' }).style, 'obsessive');
  assert.equal(getCheckInPolicy({ personality: 'Not obsessive or needy' }).style, 'normal');
});

test('relationship requests use user messages and respect later requests for space', () => {
  const history = [{ role: 'user', content: 'I want you to act more obsessive with me' }];
  assert.equal(getCheckInPolicy({}, history).style, 'obsessive');
  assert.equal(getCheckInPolicy({}, [{ role: 'assistant', content: 'I am obsessed with you' }]).style, 'normal');
  assert.equal(getCheckInPolicy({}, [{ role: 'user', content: 'The villain is obsessive' }]).style, 'normal');
  history.push({ role: 'user', content: 'Give me some space' });
  assert.equal(getCheckInPolicy({ personality: 'Obsessive' }, history).style, 'normal');
  assert.equal(getCheckInPolicy({}, [{ role: 'user', content: 'message me more often' }]).style, 'needy');
});

test('randomized schedules remain inside the selected bounds', () => {
  const from = new Date('2026-10-18T12:00:00Z');
  for (const personality of ['', 'needy', 'obsessive']) {
    const profile = { personality };
    const policy = getCheckInPolicy(profile);
    for (let i = 0; i < 40; i++) {
      const minutes = (getNextCheckInAt(from, profile) - from) / 60000;
      assert.ok(minutes >= policy.minMinutes && minutes <= policy.maxMinutes);
    }
  }
});

test('stop requests cancel scheduled check-ins regardless of personality', () => {
  const { shouldPauseCheckIns } = require('../src/ai/checkInPolicy');
  for (const content of ['Stop', 'please stop checking in for now', 'Pause for a while', 'Leave me alone', 'Give me some space', "don't message me", 'no more check-ins']) {
    assert.equal(shouldPauseCheckIns(content), true, content);
    assert.equal(getNextCheckInAt(new Date(), { personality: 'Obsessive' }, [{ role: 'user', content }]), null);
  }
  for (const content of ["don't stop", 'do not stop checking in', 'unstoppable', 'hello again']) {
    assert.equal(shouldPauseCheckIns(content), false, content);
  }
});

test('a new ordinary message resumes scheduling while assistant messages do not', () => {
  const history = [{ role: 'user', content: 'stop' }, { role: 'assistant', content: 'Okay' }];
  assert.equal(getNextCheckInAt(new Date(), {}, history), null);
  history.push({ role: 'user', content: 'Hello again!' });
  assert.ok(getNextCheckInAt(new Date(), {}, history) instanceof Date);
});
