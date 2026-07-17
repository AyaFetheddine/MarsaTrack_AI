import { AlertCircle } from 'lucide-react'
import { Component } from 'react'

class VisionResultBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidUpdate(previousProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false })
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-md border border-[#fecaca] bg-[#fff5f5] p-4 text-sm text-[#b91c1c]">
          <div className="flex gap-2">
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <p>
              Le resultat de l'analyse Vision ne peut pas etre affiche. Le matricule reste
              modifiable : vous pouvez le verifier ou le corriger avant l'enregistrement.
            </p>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default VisionResultBoundary
