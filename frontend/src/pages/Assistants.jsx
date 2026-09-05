/**
 * Ecrans du module MarsaBot Factory, affiches dans le portail MarsaPort AI.
 *
 * La console garde son propre depot, son propre backend et sa propre
 * authentification : le portail se contente de l'afficher. Detectant qu'elle
 * est encadree, elle masque sa barre laterale et son en-tete, de sorte qu'une
 * seule navigation reste visible : celle du portail.
 *
 * Aucun en-tete n'est ajoute ici : chaque ecran de la console porte deja son
 * propre titre. En ajouter un second afficherait deux fois la meme chose.
 */

// La console conserve son adresse propre, comme l'API du backend ailleurs
// dans ce frontend.
const CONSOLE_URL = 'http://localhost:5174'

function ConsoleMarsaBot({ path, titre }) {
  // Ni cadre, ni coin arrondi, ni ombre : le module doit se lire comme une page
  // du portail, pas comme un panneau pose dessus. La hauteur retranche le seul
  // en-tete du portail, la mise en page interieure venant de la console.
  return (
    <iframe
      src={`${CONSOLE_URL}${path}`}
      title={titre}
      className="block h-[calc(100vh-4rem)] w-full border-0"
    />
  )
}

export function MesBots() {
  return <ConsoleMarsaBot path="/" titre="Mes Bots" />
}

export function BaseConnaissances() {
  return <ConsoleMarsaBot path="/knowledge" titre="Base de Connaissances" />
}

export function ParametresBots() {
  return <ConsoleMarsaBot path="/settings" titre="Paramètres des assistants" />
}
