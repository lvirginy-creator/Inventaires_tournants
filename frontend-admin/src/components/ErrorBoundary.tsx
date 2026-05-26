import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

/**
 * Attrape les erreurs JavaScript non gérées dans l'arbre de composants
 * et affiche un message de repli propre plutôt qu'un écran blanc.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("[ErrorBoundary] Erreur capturée :", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center max-w-md px-8 py-12 bg-white rounded-2xl shadow-lg">
            <p className="text-5xl mb-5">⚠️</p>
            <h1 className="text-xl font-bold text-gray-900 mb-2">
              Une erreur inattendue est survenue
            </h1>
            <p className="text-sm text-gray-500 mb-6 font-mono bg-gray-50 rounded p-3 text-left">
              {this.state.message || "Erreur inconnue"}
            </p>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => this.setState({ hasError: false, message: "" })}
                className="px-4 py-2 text-sm border rounded hover:bg-gray-50 text-gray-700"
              >
                Réessayer
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Recharger la page
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
