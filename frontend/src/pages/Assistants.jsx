import { useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { clearAuthSession } from '../utils/auth'

/**
 * Ecrans du module MarsaBot Factory, affiches dans le portail MarsaPort AI.
 *
 * La console garde son depot et son backend, mais plus son authentification :
 * le portail lui transmet son propre jeton, les deux services signant avec le
 * meme secret. L'utilisateur ne s'authentifie donc qu'une fois, ce que promet
 * une application unique.
 *
 * Detectant qu'elle est encadree, la console masque sa barre laterale et son
 * en-tete, de sorte qu'une seule navigation reste visible : celle du portail.
 *
 * Aucun en-tete n'est ajoute ici : chaque ecran de la console porte deja son
 * propre titre. En ajouter un second afficherait deux fois la meme chose.
 */

// La console conserve son adresse propre, comme l'API du backend ailleurs
// dans ce frontend.
const CONSOLE_URL = 'http://localhost:5174'

const MSG_PRETE = 'marsaport:console-prete'
const MSG_SESSION = 'marsaport:session'
const MSG_EXPIREE = 'marsaport:session-expiree'

function ConsoleMarsaBot({ path, titre }) {
  const cadre = useRef(null)
  const navigate = useNavigate()

  const repondreAuCadre = useCallback((event) => {
    // Le portail recoit les messages de toutes ses fenetres filles : l'origine
    // est la seule garantie que celui-ci vient bien de la console.
    if (event.origin !== CONSOLE_URL) return
    const type = event.data?.type

    if (type === MSG_PRETE) {
      // La console signale qu'elle peut recevoir le jeton. On ne l'envoie qu'a
      // ce moment : poster a l'aveugle au chargement du cadre laisserait le
      // message se perdre si la console n'ecoute pas encore.
      const jeton = localStorage.getItem('token')
      if (jeton && cadre.current?.contentWindow) {
        cadre.current.contentWindow.postMessage(
          { type: MSG_SESSION, token: jeton },
          CONSOLE_URL,
        )
      }
      return
    }

    if (type === MSG_EXPIREE) {
      // La session du portail ne vaut plus rien : c'est tout MarsaPort AI qui
      // se deconnecte, pas seulement le module. Afficher une seconde
      // authentification dans le cadre contredirait l'application unique.
      clearAuthSession()
      navigate('/login', { replace: true })
    }
  }, [navigate])

  useEffect(() => {
    window.addEventListener('message', repondreAuCadre)
    return () => window.removeEventListener('message', repondreAuCadre)
  }, [repondreAuCadre])

  // Ni cadre, ni coin arrondi, ni ombre : le module doit se lire comme une page
  // du portail, pas comme un panneau pose dessus. La hauteur retranche le seul
  // en-tete du portail, la mise en page interieure venant de la console.
  return (
    <iframe
      ref={cadre}
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
