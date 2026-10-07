import { Component } from "react";

// Garde-fou : une erreur dans un écran (ex. tableau de bord) affiche un
// message au lieu de faire disparaître toute l'application.
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Erreur d'affichage :", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="overlay">
        <div className="dialog" role="alert">
          <h2>Un problème est survenu</h2>
          <p className="hint">Cet écran n’a pas pu s’afficher. La carte et vos données ne sont pas touchées.</p>
          <button type="button" className="button primary" onClick={this.props.onClose}>
            Fermer
          </button>
        </div>
      </div>
    );
  }
}
