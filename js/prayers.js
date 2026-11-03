// Prayers that can open each list, from the Book of Common Prayer.
// Every list's prayer can be swapped for another here, edited, or replaced
// with your own words (Lists → a list → ⋯ → Prayer).

export const PRAYERS = {
  church: {
    title: 'For the Church',
    text: 'Gracious Father, we pray for thy holy Catholic Church. Fill it with all truth, in all truth with all peace. Where it is corrupt, purify it; where it is in error, direct it; where in any thing it is amiss, reform it. Where it is right, strengthen it; where it is in want, provide for it; where it is divided, reunite it; for the sake of Jesus Christ thy Son our Savior. Amen.',
  },
  unity: {
    title: 'For the Unity of the Church',
    text: 'O God the Father of our Lord Jesus Christ, our only Savior, the Prince of Peace: Give us grace seriously to lay to heart the great dangers we are in by our unhappy divisions; take away all hatred and prejudice, and whatever else may hinder us from godly union and concord; that, as there is but one Body and one Spirit, one hope of our calling, one Lord, one Faith, one Baptism, one God and Father of us all, so we may be all of one heart and of one soul, united in one holy bond of truth and peace, of faith and charity, and may with one mind and one mouth glorify thee; through Jesus Christ our Lord. Amen.',
  },
  mission: {
    title: 'For the Mission of the Church',
    text: 'Everliving God, whose will it is that all should come to you through your Son Jesus Christ: Inspire our witness to him, that all may know the power of his forgiveness and the hope of his resurrection; who lives and reigns with you and the Holy Spirit, one God, now and for ever. Amen.',
  },
  diocese: {
    title: 'For the Diocese',
    text: 'O God, by your grace you have called us in this Diocese to a goodly fellowship of faith. Bless our Bishop N., and other clergy, and all our people. Grant that your Word may be truly preached and truly heard, your Sacraments faithfully administered and faithfully received. By your Spirit, fashion our lives according to the example of your Son, and grant that we may show the power of your love to all among whom we live; through Jesus Christ our Lord. Amen.',
  },
  parish: {
    title: 'For the Parish',
    text: 'Almighty and everliving God, ruler of all things in heaven and earth, hear our prayers for this parish family. Strengthen the faithful, arouse the careless, and restore the penitent. Grant us all things necessary for our common life, and bring us all to be of one heart and mind within your holy Church; through Jesus Christ our Lord. Amen.',
  },
  clergy: {
    title: 'For Clergy and People',
    text: 'Almighty and everlasting God, from whom cometh every good and perfect gift: Send down upon our bishops, and other clergy, and upon the congregations committed to their charge, the healthful Spirit of thy grace; and, that they may truly please thee, pour upon them the continual dew of thy blessing. Grant this, O Lord, for the honor of our Advocate and Mediator, Jesus Christ. Amen.',
  },
  conditions: {
    title: 'For All Sorts and Conditions of Men',
    text: 'O God, the creator and preserver of all mankind, we humbly beseech thee for all sorts and conditions of men; that thou wouldest be pleased to make thy ways known unto them, thy saving health unto all nations. More especially we pray for thy holy Church universal; that it may be so guided and governed by thy good Spirit, that all who profess and call themselves Christians may be led into the way of truth, and hold the faith in unity of spirit, in the bond of peace, and in righteousness of life. Finally, we commend to thy fatherly goodness all those who are in any ways afflicted or distressed, in mind, body, or estate; especially those for whom our prayers are desired; that it may please thee to comfort and relieve them according to their several necessities, giving them patience under their sufferings, and a happy issue out of all their afflictions. And this we beg for Jesus Christ’s sake. Amen.',
  },
  loved: {
    title: 'For Those We Love',
    text: 'Almighty God, we entrust all who are dear to us to thy never-failing care and love, for this life and the life to come, knowing that thou art doing for them better things than we can desire or pray for; through Jesus Christ our Lord. Amen.',
  },
  absent: {
    title: 'For the Absent',
    text: 'O God, whose fatherly care reacheth to the uttermost parts of the earth: We humbly beseech thee graciously to behold and bless those whom we love, now absent from us. Defend them from all dangers of soul and body; and grant that both they and we, drawing nearer to thee, may be bound together by thy love in the communion of thy Holy Spirit, and in the fellowship of thy saints; through Jesus Christ our Lord. Amen.',
  },
  trouble: {
    title: 'For a Person in Trouble or Bereavement',
    text: 'O merciful Father, who hast taught us in thy holy Word that thou dost not willingly afflict or grieve the children of men: Look with pity upon the sorrows of thy servant for whom our prayers are offered. Remember him, O Lord, in mercy, nourish his soul with patience, comfort him with a sense of thy goodness, lift up thy countenance upon him, and give him peace; through Jesus Christ our Lord. Amen.',
  },
  human: {
    title: 'For the Human Family',
    text: 'O God, you made us in your own image and redeemed us through Jesus your Son: Look with compassion on the whole human family; take away the arrogance and hatred which infect our hearts; break down the walls that separate us; unite us in bonds of love; and work through our struggle and confusion to accomplish your purposes on earth; that, in your good time, all nations and races may serve you in harmony around your heavenly throne; through Jesus Christ our Lord. Amen.',
  },
};

export const SOURCE = 'The Book of Common Prayer';

/** Which prayer each of the starting lists opens with. */
export const DEFAULT_PRAYER = {
  anglican: 'church',
  diocese: 'diocese',
  trinity: 'parish',
  requests: 'conditions',
  family: 'loved',
  clergy: 'clergy',
};

/**
 * A list's prayer: { title, text, key? } or null for none.
 * list.prayer is { key } for a Prayer Book prayer, { title, text } for your own, or null.
 */
export function prayerFor(list) {
  const p = list.prayer;
  if (p === null) return null;
  if (p === undefined) {
    const key = DEFAULT_PRAYER[list.id];
    return key ? { ...PRAYERS[key], key } : null;
  }
  if (p.key && PRAYERS[p.key] && p.text == null) return { ...PRAYERS[p.key], key: p.key };
  if (p.text && p.text.trim()) return { title: p.title || 'Prayer', text: p.text, key: p.key || null };
  return null;
}
