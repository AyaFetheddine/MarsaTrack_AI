import { Eye, EyeOff, Lock, LogIn, User } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '../api/api'
import logo from '../assets/Marsamaroc-logo.png'

function Login() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ matricule: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await authApi.login(form)
      localStorage.setItem('token', response.data.token)
      localStorage.setItem('user', JSON.stringify(response.data.user))
      navigate('/dashboard', { replace: true })
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          'Connexion impossible. Verifiez vos identifiants.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(150deg,#f0f6fc_0%,#e6f2fb_55%,#f5f9ff_100%)] p-5">
      <section className="w-full max-w-[420px] rounded-lg bg-white px-6 py-9 shadow-login sm:px-10 sm:pb-10 sm:pt-12">
        <img
          src={logo}
          alt="Marsa Maroc"
          className="mx-auto mb-6 h-auto w-[180px]"
        />

        <div className="mb-8 text-center">
          <h1 className="mb-1.5 text-2xl font-bold text-marsa-royal">
            MarsaTrack AI
          </h1>
          <p className="text-sm text-marsa-muted">
            Gestion operationnelle et suivi terrain
          </p>
        </div>

        <form className="space-y-[18px]" onSubmit={handleSubmit}>
          <div>
            <label className="form-label" htmlFor="matricule">
              Matricule
            </label>
            <div className="relative">
              <User
                size={18}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7f9db9]"
                aria-hidden="true"
              />
              <input
                id="matricule"
                name="matricule"
                type="text"
                value={form.matricule}
                onChange={handleChange}
                className="form-input"
                placeholder="Ex. CE-001"
                autoComplete="username"
                required
              />
            </div>
          </div>

          <div>
            <label className="form-label" htmlFor="password">
              Mot de passe
            </label>
            <div className="relative">
              <Lock
                size={18}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7f9db9]"
                aria-hidden="true"
              />
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={handleChange}
                className="form-input pr-12"
                placeholder="Votre mot de passe"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-[#7f9db9] transition hover:bg-[#e8f1fb] hover:text-marsa-royal focus:outline-none focus:ring-2 focus:ring-marsa-ciel/40"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={
                  showPassword
                    ? 'Masquer le mot de passe'
                    : 'Afficher le mot de passe'
                }
                title={
                  showPassword
                    ? 'Masquer le mot de passe'
                    : 'Afficher le mot de passe'
                }
              >
                {showPassword ? (
                  <EyeOff size={19} aria-hidden="true" />
                ) : (
                  <Eye size={19} aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          {error && (
            <p
              className="rounded-md border border-[#ffcdd2] bg-[#fff2f2] px-3.5 py-2.5 text-sm text-[#b71c1c]"
              role="alert"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-marsa-royal px-4 font-bold text-white transition hover:-translate-y-px hover:bg-marsa-ciel hover:shadow-[0_4px_16px_rgba(0,153,204,0.30)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
          >
            <LogIn size={19} aria-hidden="true" />
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>
      </section>
    </main>
  )
}

export default Login
