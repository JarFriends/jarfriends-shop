// The shop's products. "stock" is the starting count; the site's ledger takes sold units off it (see testsheet.js).
// deal puts a piece in the Deal of the day safes, in that order (1 opens first). Stock 0 = already claimed.
// weight_oz and box set the package for the shipping label (box: small, medium or large flat rate box).
// nft: 'yes' marks a digital piece: no shipping, and checkout asks for a wallet address instead of a mailing address.
// section puts a piece in one or more home page sections (comma-separated).
// shipping is charged once per order: a dollar amount, or 0 / "free" for free shipping.
// The owner adds, edits, hides and re-orders products in the back office; those changes sit on top of this list (see _edits.js).
// MPARTY is the party listing (see _party.js): its own 11 units, apart from the regular MONSTER listing.
module.exports = [
  { id: 'MONSTER', name: 'Motivated Monster Comic Pack (Issue 05)', price: 44, min: 1, stock: 11, shipping: 5.3, section: 'Comics' },
  { id: 'HARPIK', name: 'VeeFriends Comic Pack Issue 04: Thoughtful Three Horned Harpik', price: 62, min: 1, stock: 1, shipping: 5.3, section: 'Comics' },
  { id: 'ASTRO', name: 'VeeFriends Comic Pack Issue 11: Adventurous Astronaut', price: 44, min: 1, stock: 2, shipping: 5.3, section: 'Comics' },
  { id: 'MPARTY', name: 'Motivated Monster Comic Pack (Issue 05): Party Pricing', price: 44, min: 1, stock: 11, shipping: 5.3 },
  { id: 'JACKO', name: 'VeeFriends Comic Issue 23: Jolly Jack-O (Burn Island Exclusive)', price: 88.1, min: 1, stock: 11, shipping: 'free', deal: 1, weight_oz: 6, box: 'Medium flat rate box' },
  { id: 'DEAL1', name: 'Whimsical Wolf Gilt Medal (NGC Gem Proof) + Principled Praying Mantis Gold Manga Metal 56/67', price: 88.1, min: 1, stock: 1, shipping: 'free', deal: 2 },
  { id: 'DEAL2', name: 'Koala 2025 Bundle (CGC 9 Super Sticker, Class of 2022 Pins, Packs) + Motivated Monster Comic', price: 88.1, min: 1, stock: 1, shipping: 'free', deal: 3 },
  { id: 'DEAL3', name: "Vibin' Vampire NFT: Halloween Season Sale", price: 161, min: 1, stock: 1, shipping: 'free', deal: 4, nft: 'yes', section: 'NFTs' }
];
