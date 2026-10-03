// Base d'exemple « support » : tickets du service client et événements web, reliés aux clients de la boutique.
db = db.getSiblingDB('support')
const motifs = ['Livraison', 'Remboursement', 'Produit défectueux', 'Facturation', 'Compte client', 'Retour']
const statuts = ['ouvert', 'en cours', 'résolu', 'résolu', 'résolu', 'fermé']
const canaux = ['chat', 'e-mail', 'téléphone']
const now = Date.now()
let seed = 7
const rnd = () => {
  seed = (seed * 16807) % 2147483647
  return seed / 2147483647
}
const tickets = []
for (let i = 1; i <= 4000; i++) {
  tickets.push({
    ticket_id: i,
    client_id: 1 + Math.floor(rnd() * 2500),
    motif: motifs[Math.floor(rnd() * motifs.length)],
    statut: statuts[Math.floor(rnd() * statuts.length)],
    canal: canaux[Math.floor(rnd() * canaux.length)],
    satisfaction: i === 1 || rnd() < 0.7 ? 1 + Math.floor(rnd() * 5) : null,
    delai_resolution_h: Math.round(rnd() * 960) / 10,
    cree_le: new Date(now - Math.floor(rnd() * 700) * 86400000),
  })
}
db.tickets.insertMany(tickets)
const pages = ['/', '/produits', '/panier', '/commande', '/compte', '/aide']
const events = []
for (let i = 1; i <= 20000; i++) {
  events.push({
    client_id: rnd() < 0.6 ? 1 + Math.floor(rnd() * 2500) : null,
    page: pages[Math.floor(rnd() * pages.length)],
    appareil: rnd() < 0.55 ? 'mobile' : rnd() < 0.85 ? 'ordinateur' : 'tablette',
    duree_s: Math.floor(rnd() * 600),
    survenu_le: new Date(now - Math.floor(rnd() * 90 * 86400000)),
  })
}
db.evenements_web.insertMany(events)
