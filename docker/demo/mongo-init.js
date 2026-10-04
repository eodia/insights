// Base d'exemple « support » : les tickets du service client et le parcours des visiteurs du
// site, pour la boutique Maison Arvor (base PostgreSQL « boutique »).
//
// Les deux bases suivent le même calendrier, relatif au jour de création, et la même courbe
// d'inscription des clients : un ticket du jour t vient d'un client déjà inscrit à t, ce qui
// rend les jointures entre les deux bases cohérentes. On y retrouve :
//   · la grève du transporteur (68 à 48 jours avant aujourd'hui) : les tickets « Livraison »
//     explosent, le délai de résolution triple, la satisfaction plonge ;
//   · le défaut de batterie des Kerys Air 2 (170 à 128 jours) : tickets « Produit défectueux » ;
//   · le bug de paiement de l'application (35 à 31 jours) : tickets « Paiement », et dans le
//     parcours web, la conversion mobile qui s'effondre à la dernière étape.
db = db.getSiblingDB('support')

let seed = 7
const rnd = () => {
  seed = (seed * 16807) % 2147483647
  return seed / 2147483647
}
const normal = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd())
const pick = (weights) => {
  const total = Object.values(weights).reduce((a, b) => a + b, 0)
  let r = rnd() * total
  for (const [k, w] of Object.entries(weights)) {
    r -= w
    if (r <= 0) return k
  }
  return Object.keys(weights)[0]
}

const DAY = 86400000
const today = new Date()
today.setUTCHours(0, 0, 0, 0)
const now = Date.now()
const T = 1095
const N = 16000
const k = Math.log(1.35) / 365
const debut = today.getTime() - T * DAY
const dayOf = (offset) => today.getTime() - offset * DAY
const between = (t, from, to) => t >= dayOf(from) && t < dayOf(to) + DAY

// The clients registered by time t (days since the start): the same curve as PostgreSQL.
const idmax = (tf) => Math.max(1, Math.floor((N * (Math.exp(k * tf) - 1)) / (Math.exp(k * T) - 1)))
const SEASON = [1.04, 0.86, 0.92, 0.96, 1.0, 0.98, 1.03, 0.78, 0.95, 1.0, 1.16, 1.48]
const WEEK = [1.17, 1.04, 0.97, 1.0, 0.98, 0.94, 0.9] // Sunday first, as getUTCDay
const orders = (t) => {
  const d = new Date(debut + t * DAY)
  return 30 * Math.exp(k * t) * SEASON[d.getUTCMonth()] * WEEK[d.getUTCDay()]
}

// ── Tickets ─────────────────────────────────────────────────────────────────
const AGENTS = [
  { name: 'Léa M.', speed: 0.8, mood: 0.25 },
  { name: 'Hugo B.', speed: 1.0, mood: 0 },
  { name: 'Inès K.', speed: 0.7, mood: 0.35 },
  { name: 'Thomas R.', speed: 1.35, mood: -0.3 },
  { name: 'Sarah L.', speed: 0.9, mood: 0.1 },
  { name: 'Karim D.', speed: 1.1, mood: -0.1 },
  { name: 'Julie P.', speed: 0.85, mood: 0.2 },
  { name: 'Maxime T.', speed: 1.2, mood: -0.2 },
]
const MOTIFS = { Livraison: 30, Retour: 18, Remboursement: 14, 'Produit défectueux': 12, Facturation: 9, 'Compte client': 9, Paiement: 8 }
const HOURS = { Livraison: 20, Retour: 30, Remboursement: 40, 'Produit défectueux': 36, Facturation: 18, 'Compte client': 6, Paiement: 10 }
const FIRST_CONTACT = { 'Compte client': 0.8, Facturation: 0.6, Paiement: 0.55, Livraison: 0.45, Retour: 0.3, Remboursement: 0.25, 'Produit défectueux': 0.2 }
const PRODUCTS = ['Smartphone Novéa 12', 'Friteuse sans huile Brise XL', 'Chaussures Altitude Trail 3', 'Robot pâtissier Opaline', 'Casque Kerys Studio ANC', 'Tondeuse sans fil Altitude 40', 'Montre GPS Kerys Run', 'Matelas Arvor Mémoire 160']

const tickets = []
let ticketId = 0
for (let t = 0; t <= T; t++) {
  const day = debut + t * DAY
  const base = 0.065 * orders(t)
  const strike = between(day, 68, 41) // the backlog lasts a week after the strike
  const defect = between(day, 170, 114)
  const bug = between(day, 35, 31)
  const batches = [
    [base, null],
    [strike ? base * 0.3 * 9 : 0, 'Livraison'],
    [defect ? 9 : 0, 'Produit défectueux'],
    [defect ? 3 : 0, 'Remboursement'],
    [bug ? 30 : 0, 'Paiement'],
  ]
  for (const [lambda, forced] of batches) {
    const count = Math.max(0, Math.round(lambda + normal() * Math.sqrt(lambda)))
    for (let n = 0; n < count; n++) {
      const created = day + Math.floor(rnd() * DAY)
      if (created > now) continue
      const tf = (created - debut) / DAY
      const motif = forced ?? pick(MOTIFS)
      const f = tf / T
      const canal = pick({ chat: 0.25 + 0.25 * f + (bug ? 0.3 : 0), 'e-mail': 0.4 - 0.1 * f, téléphone: 0.35 - 0.15 * f })
      const agent = AGENTS[Math.floor(rnd() * AGENTS.length)]
      const backlog = strike ? 2.8 : defect && motif === 'Produit défectueux' ? 1.5 : 1
      const hours =
        Math.round(
          HOURS[motif] * agent.speed * backlog * ({ chat: 0.5, téléphone: 0.4, 'e-mail': 1.3 }[canal] ?? 1) * Math.exp(normal() * 0.55) * 10,
        ) / 10
      const resolved = created + hours * 3600000 <= now
      const mood = 4.6 - 0.018 * Math.min(hours, 120) + agent.mood + normal() * 0.7 - (strike && motif === 'Livraison' ? 0.6 : 0)
      ticketId++
      tickets.push({
        ticket_id: ticketId,
        client_id: Math.max(1, idmax(tf) - Math.floor((idmax(tf) - 1) * rnd() ** 1.6)),
        motif,
        statut: resolved ? (rnd() < 0.85 ? 'résolu' : 'fermé') : rnd() < 0.5 ? 'ouvert' : 'en cours',
        canal,
        priorite: (strike && motif === 'Livraison') || (defect && motif === 'Produit défectueux') ? (rnd() < 0.4 ? 'haute' : 'normale') : pick({ haute: 0.12, normale: 0.68, basse: 0.2 }),
        agent: agent.name,
        // The first ticket carries every field: Trino reads the shape of a collection from it.
        produit:
          motif === 'Produit défectueux' && defect
            ? 'Écouteurs Kerys Air 2'
            : ticketId === 1 || motif === 'Produit défectueux' || motif === 'Retour'
              ? PRODUCTS[Math.floor(rnd() * PRODUCTS.length)]
              : null,
        satisfaction: ticketId === 1 || (resolved && rnd() < 0.65) ? Math.min(5, Math.max(1, Math.round(mood))) : null,
        premier_contact_resolu: rnd() < FIRST_CONTACT[motif] * (strike ? 0.35 : 1),
        delai_resolution_h: hours,
        cree_le: new Date(created),
        resolu_le: ticketId === 1 || resolved ? new Date(created + hours * 3600000) : null,
      })
    }
  }
}
tickets.sort((a, b) => a.ticket_id - b.ticket_id)
db.tickets.insertMany(tickets)
db.tickets.createIndex({ cree_le: 1 })

// ── Parcours web : les 90 derniers jours ───────────────────────────────────
const STEPS = [
  ['Accueil', '/'],
  ['Fiche produit', '/produits'],
  ['Panier', '/panier'],
  ['Paiement', '/commande'],
  ['Confirmation', '/commande/confirmation'],
]
const events = []
let session = 0
for (let back = 90; back >= 0; back--) {
  const day = dayOf(back)
  const t = (day - debut) / DAY
  const strike = between(day, 68, 45)
  const bug = between(day, 35, 31)
  const sessions = Math.round(orders(t) * 11 * Math.exp(normal() * 0.08))
  for (let s = 0; s < sessions; s++) {
    let at = day + Math.floor(rnd() * DAY)
    if (at > now) continue
    session++
    const appareil = pick({ mobile: 0.58, ordinateur: 0.34, tablette: 0.08 })
    const source = pick({ SEO: 0.3, SEA: 0.22, 'Réseaux sociaux': 0.16, Direct: 0.18, Newsletter: 0.08, Parrainage: 0.06 })
    const logged = session === 1 || rnd() < 0.4
    const client = logged ? Math.max(1, idmax(t) - Math.floor((idmax(t) - 1) * rnd() ** 1.4)) : null
    const go = [
      1,
      0.66,
      appareil === 'mobile' ? 0.21 : 0.26,
      0.58,
      appareil === 'mobile' && bug ? 0.09 : appareil === 'mobile' ? 0.8 : 0.84,
    ]
    const push = (etape, ordre, page) => {
      const duree = Math.max(3, Math.round(Math.exp(3.4 + normal() * 0.8)))
      events.push({
        session_id: `s-${String(session).padStart(7, '0')}`,
        client_id: client,
        page,
        etape,
        etape_ordre: ordre,
        appareil,
        source,
        duree_s: duree,
        survenu_le: new Date(at),
      })
      at += duree * 1000
    }
    for (let i = 0; i < STEPS.length; i++) {
      if (rnd() >= go[i]) break
      push(STEPS[i][0], i + 1, STEPS[i][1])
    }
    // Some come for something else: their account, or help — far more during the strike.
    if (rnd() < (strike ? 0.16 : 0.05)) push('Aide', 0, '/aide')
    else if (logged && rnd() < 0.08) push('Compte', 0, '/compte')
  }
}
for (let i = 0; i < events.length; i += 10000) db.evenements_web.insertMany(events.slice(i, i + 10000))
db.evenements_web.createIndex({ survenu_le: 1 })
