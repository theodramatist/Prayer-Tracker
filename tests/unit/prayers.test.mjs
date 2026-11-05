import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PRAYERS, SECTIONS, prayerById, prayerText, prayerPage, prayersFor, itemPrayer, isPrayerItem, hasBothForms, firstWords } from '../../js/prayers.js';
import { Store } from '../../js/store.js';
import { SEEDS } from '../../js/seeds.js';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, removeItem: (k) => { delete data[k]; } };
}

test('the library is the Prayer Book’s 70 prayers and 11 thanksgivings, under its headings, and the Vigil prayer', () => {
  const ids = Object.keys(PRAYERS);
  assert.equal(ids.filter((id) => /^p\d+$/.test(id)).length, 70);
  assert.equal(ids.filter((id) => /^t\d+$/.test(id)).length, 11);
  assert.equal(PRAYERS.p57.title, 'For Guidance');
  assert.equal(PRAYERS.p57.page, 832);
  assert.equal(PRAYERS.t1.title, 'A General Thanksgiving');
  assert.deepEqual(SECTIONS.slice(0, 3).map((s) => s.title), ['Prayers for the World', 'Prayers for the Church', 'Prayers for National Life']);
  assert.deepEqual(SECTIONS.slice(-4).map((s) => s.title), ['From the Great Vigil of Easter', 'From Morning Prayer', 'From Evening Prayer', 'From the Collects']);
  assert.match(PRAYERS.vigil.text, /^God and Father of all believers, for the glory of your Name multiply, by the grace of the Paschal sacrament/);
  // Earlier versions' names for the prayers still work.
  assert.equal(prayerById('conditions').id, 'p2');
  assert.equal(prayerById('church').id, 'p7');
});

test('prayers whose pronouns and verbs the Prayer Book puts in italics come in Rite One and Rite Two language', () => {
  const quiet = PRAYERS.p59;
  assert.ok(hasBothForms(quiet));
  assert.ok(prayerText(quiet, 'traditional').startsWith('O God of peace, who hast taught us that in returning and rest we'));
  assert.ok(prayerText(quiet, 'contemporary').startsWith('O God of peace, you have taught us that in returning and rest we'));
  assert.match(prayerText(quiet, 'contemporary'), /lift us, we pray you, to your presence, where we may be still and know that you are God;/);
  assert.match(prayerText(PRAYERS.p42, 'contemporary'), /^O gracious Father, you open your hand and fill all things living/);
  assert.match(prayerText(PRAYERS.p61, 'contemporary'), /that we may be wholly yours, utterly dedicated to you;/);
  // Names, choices and "he or she" stay as printed.
  assert.match(prayerText(PRAYERS.t11, 'contemporary'), /deliver from his sickness your servant N\., in whose behalf/);
  assert.equal(Object.values(PRAYERS).filter((p) => /^[pt]\d+$/.test(p.id) && hasBothForms(p) && !p.rendered).length, 20);
  // Responses keep their place, and contemporary prayers have the one form.
  assert.equal(hasBothForms(PRAYERS.p3), false);
});

test('the classical prayers the Prayer Book leaves unmarked say you and your in Rite Two too', () => {
  const classical = Object.values(PRAYERS).filter((p) => p.rendered === 'app').map((p) => p.id);
  assert.deepEqual(classical, ['p2', 'p7', 'p9', 'p18', 'p45', 'p51', 'p55', 'p65', 'p67', 't9']);
  const ii = (id) => prayerText(PRAYERS[id], 'contemporary');
  const i = (id) => prayerText(PRAYERS[id], 'traditional');
  assert.match(i('p2'), /that thou wouldest be pleased to make thy ways known unto them/);
  assert.match(ii('p2'), /we humbly beseech you for all sorts and conditions of men; that you would be pleased to make your ways known to them, your saving health to all nations\./);
  assert.match(ii('p7'), /^Gracious Father, we pray for your holy Catholic Church\..* for the sake of Jesus Christ your Son our Savior\. Amen\.$/);
  assert.match(ii('p9'), /^Almighty and everlasting God, from whom comes every good and perfect gift: .*the healthful Spirit of your grace; and, that they may truly please you, pour upon them the continual dew of your blessing\./);
  assert.match(ii('p55'), /^O merciful Father, you have taught us in your holy Word that you do not willingly afflict or grieve the children of men:/);
  assert.match(ii('p45'), /^Almighty God, our heavenly Father, you set the solitary in families: We commend to your continual care/);
  assert.match(ii('p65'), /incline your ear to us who have now made our prayers and supplications to you;/);
  assert.match(ii('p67'), /; who live and reign with the Father and the Holy Spirit, one God, for ever and ever\. Amen\.$/);
  for (const id of classical) assert.doesNotMatch(ii(id), /\b(thee|thou|thy|thine|hast|dost|wouldest|unto|cometh|passeth|livest|reignest|settest)\b/i, id);
  assert.equal(Object.values(PRAYERS).filter((p) => /^[pt]\d+$/.test(p.id) && hasBothForms(p)).length, 30);
  // And the Office's twenty, with Proper 28, as the Prayer Book prints them in each rite.
  assert.equal(Object.values(PRAYERS).filter((p) => !/^[pt]\d+$/.test(p.id) && hasBothForms(p)).length, 21);
  assert.match(prayerText(PRAYERS.t2), /\n\*We thank you, Lord\.\*\n/);
});

test('a list opens with its prayers: Prayer Requests with the Vigil prayer, then All Sorts and Conditions', () => {
  const requests = { id: 'requests', items: [] };
  assert.deepEqual(prayersFor(requests).map((p) => p.title), ['The Great Vigil: Abraham’s Sacrifice of Isaac', 'For All Sorts and Conditions of Men']);
  assert.deepEqual(prayersFor({ id: 'family' }, 'traditional').map((p) => p.text.slice(0, 41)), ['Almighty God, we entrust all who are dear']);
  assert.match(prayersFor({ id: 'family' }, 'traditional')[0].text, /thy never-failing care/);
  assert.match(prayersFor({ id: 'family' }, 'contemporary')[0].text, /your never-failing care/);
  // A single prayer as earlier versions stored it, several, your own words, or none.
  assert.deepEqual(prayersFor({ id: 'x', prayer: { key: 'church' } }).map((p) => p.key), ['p7']);
  assert.deepEqual(prayersFor({ id: 'x', prayer: [{ key: 'p57' }, { title: 'Mine', text: 'Lord, hear us.' }] }).map((p) => p.title), ['For Guidance', 'Mine']);
  assert.deepEqual(prayersFor({ id: 'requests', prayer: null }), []);
  assert.equal(firstWords('One two three four five', 3), 'One two three…');
});

test('Prayers and Thanksgivings: a list of chosen prayers, prayed one by one, added to older copies too', () => {
  const store = new Store(memoryStorage());
  const list = store.state.lists.find((l) => l.kind === 'prayers');
  assert.equal(list.id, 'prayers');
  const [g, own] = store.addItems('prayers', [{ text: 'For Guidance', prayer: 'p57' }, { text: 'For the Vestry', prayerText: 'Bless our vestry. Amen.' }]);
  assert.ok(isPrayerItem(g) && isPrayerItem(own));
  assert.match(itemPrayer(g, 'traditional').text, /^Direct us, O Lord, in all our doings with thy most gracious favor/);
  assert.match(itemPrayer(g, 'contemporary').text, /^Direct us, O Lord, in all our doings with your most gracious favor/);
  assert.equal(itemPrayer(own).text, 'Bless our vestry. Amen.');
  assert.equal(isPrayerItem({ text: 'Mom' }), false);

  // A copy from before the list existed gets it, at the end, empty.
  const old = new Store(memoryStorage());
  old.commit((s) => { s.lists = s.lists.filter((l) => l.id !== 'prayers'); });
  for (const seed of SEEDS) old.seed(seed);
  assert.equal(old.state.lists.at(-1).id, 'prayers');
  assert.equal(old.list('prayers').items.length, 0);
});

test('the Great Vigil’s prayers, after each Lesson and at the Eucharist, as printed (pages 285-295)', () => {
  const vigil = SECTIONS.find((x) => x.title === 'From the Great Vigil of Easter').prayers;
  assert.deepEqual(vigil.map((p) => p.id), ['vigil-candle', 'vigil-creation', 'vigil-flood', 'vigil', 'vigil-red-sea', 'vigil-renewed-israel',
    'vigil-salvation', 'vigil-new-heart', 'vigil-dry-bones', 'vigil-gathering', 'vigil-eucharist']);
  // Printed in contemporary language only, so they have the one form.
  assert.ok(vigil.every((p) => p.text && !hasBothForms(p)));
  assert.equal(PRAYERS['vigil-candle'].page, 285);
  assert.match(PRAYERS['vigil-candle'].text, /^O God, through your Son you have bestowed upon your people the brightness of your light: Sanctify this new fire/);
  assert.match(PRAYERS['vigil-creation'].text, /^O God, who wonderfully created, and yet more wonderfully restored, the dignity of human nature/);
  // "who are reborn", where the Second Sunday of Easter's has "who have been reborn".
  assert.match(PRAYERS['vigil-new-heart'].text, /Grant that all who are reborn into the fellowship of Christ’s Body/);
  assert.equal(PRAYERS.vigil.page, 289);
  assert.match(PRAYERS.vigil.text, /^God and Father of all believers, for the glory of your Name multiply/);
  // At the Eucharist, the two Collects with "or this" between them.
  assert.deepEqual(PRAYERS['vigil-eucharist'].text.split('\n').map((l) => l.slice(0, 24)), ['Almighty God, who for ou', '*or this*', 'O God, who made this mos']);
  assert.match(PRAYERS['vigil-eucharist'].text, /gave your only-begotten Son to the death of the cross/);
});

test('Morning and Evening Prayer’s Collects and prayers for mission, in each rite’s own words and pages', () => {
  const mp = SECTIONS.find((x) => x.title === 'From Morning Prayer').prayers;
  const ep = SECTIONS.find((x) => x.title === 'From Evening Prayer').prayers;
  assert.deepEqual(mp.map((p) => p.title), ['A Collect for Sundays', 'A Collect for Fridays', 'A Collect for Saturdays', 'A Collect for the Renewal of Life',
    'A Collect for Peace', 'A Collect for Grace', 'A Collect for Guidance', 'For Mission: Almighty and everlasting God, by whose Spirit',
    'For Mission: O God, you have made of one blood', 'For Mission: Lord Jesus Christ, you stretched out your arms']);
  assert.deepEqual(ep.map((p) => p.title), ['A Collect for Sundays', 'A Collect for Fridays', 'A Collect for Saturdays', 'A Collect for Peace',
    'A Collect for Aid against Perils', 'A Collect for Protection', 'A Collect for the Presence of Christ', 'For Mission: O God and Father of all',
    'For Mission: Keep watch, dear Lord', 'For Mission: O God, you manifest in your servants']);
  for (const p of [...mp, ...ep]) {
    assert.ok(hasBothForms(p), p.id);
    for (const rite of ['traditional', 'contemporary']) assert.match(prayerText(p, rite), /Amen\.$/, `${p.id} ${rite}`);
  }
  // Rite One's own words, not Rite Two's with thee and thou put in.
  assert.match(prayerText(PRAYERS['ep-peace'], 'traditional'), /^O God, from whom all holy desires, all good counsels, and all just works do proceed/);
  assert.match(prayerText(PRAYERS['ep-peace'], 'contemporary'), /^Most holy God, the source of all good desires, all right judgments, and all just works/);
  assert.match(prayerText(PRAYERS['ep-aid-against-perils'], 'traditional'), /^Lighten our darkness, we beseech thee, O Lord/);
  // Where the Online Book of Common Prayer's pages differ, the Prayer Book's own: "your Son", and "the Spirit of love".
  assert.match(prayerText(PRAYERS['mp-fridays'], 'contemporary'), /the way of life and peace; through Jesus Christ your Son our Lord\. Amen\.$/);
  assert.match(prayerText(PRAYERS['ep-mission-3'], 'contemporary'), /Send forth upon us the Spirit of love/);
  // A word broken over a line in the Prayer Book is whole.
  assert.match(prayerText(PRAYERS['ep-mission-1'], 'traditional'), /men and women everywhere love thee/);
  // Each rite's page.
  assert.deepEqual([prayerPage(PRAYERS['mp-fridays'], 'traditional'), prayerPage(PRAYERS['mp-fridays'], 'contemporary')], [56, 99]);
  assert.equal(prayerPage(PRAYERS.p57, 'traditional'), 832);
});

test('the Collect for Proper 28, "read, mark, learn, and inwardly digest", as in the Collects', () => {
  const p = PRAYERS['proper-28'];
  assert.equal(prayerText(p, 'traditional'), 'Blessed Lord, who hast caused all holy Scriptures to be written for our learning: Grant that we may in such wise hear them, read, mark, learn, and inwardly digest them; that, by patience and comfort of thy holy Word, we may embrace and ever hold fast the blessed hope of everlasting life, which thou hast given us in our Savior Jesus Christ; who liveth and reigneth with thee and the Holy Spirit, one God, for ever and ever. Amen.');
  assert.equal(prayerText(p, 'contemporary'), 'Blessed Lord, who caused all holy Scriptures to be written for our learning: Grant us so to hear them, read, mark, learn, and inwardly digest them, that we may embrace and ever hold fast the blessed hope of everlasting life, which you have given us in our Savior Jesus Christ; who lives and reigns with you and the Holy Spirit, one God, for ever and ever. Amen.');
  assert.deepEqual([prayerPage(p, 'traditional'), prayerPage(p, 'contemporary')], [184, 236]);
});
