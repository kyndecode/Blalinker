import { useEffect, useLayoutEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Défile jusqu'à l'élément et lui donne le focus (clavier, lecteur d'écran) sans second défilement. */
export function scrollToSection(el: HTMLElement): void {
  el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  if (!el.hasAttribute('tabindex') && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) {
    el.setAttribute('tabindex', '-1');
  }
  el.focus({ preventScroll: true });
}

/**
 * Défilement à chaque navigation (BrowserRouter ne le gère pas) :
 * - nouvelle page : ouverture en haut. Avant, la page s'ouvrait au niveau de défilement de la
 *   précédente (ex. lien du pied de page : page « Contact » ouverte 1 900 px plus bas) ;
 * - lien vers une section (#ancre) : défilement jusqu'à elle, même si elle n'apparaît qu'après
 *   le chargement des données (attente jusqu'à 4 s). L'en-tête fixe ne la masque pas
 *   (scroll-padding-top dans globals.css) ;
 * - retour ou avance du navigateur : position laissée au navigateur ;
 * - simple changement de filtre (même page, paramètres différents) : pas de saut en haut.
 */
export default function ScrollManager() {
  const { pathname, hash } = useLocation();
  const navigationType = useNavigationType();

  useLayoutEffect(() => {
    if (hash || navigationType === 'POP') return;
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps -- uniquement au changement de page

  useEffect(() => {
    if (!hash) return undefined;
    // Ancre mal encodée (ex. « #%E0%A4%A ») : decodeURIComponent lève une erreur qui rendait tout
    // le site blanc ; on garde alors l'ancre telle quelle.
    let id = hash.slice(1);
    try { id = decodeURIComponent(id); } catch { /* ancre conservée brute */ }
    const target = () => document.getElementById(id);
    const found = target();
    if (found) { scrollToSection(found); return undefined; }
    const observer = new MutationObserver(() => {
      const el = target();
      if (el) { observer.disconnect(); scrollToSection(el); }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setTimeout(() => observer.disconnect(), 4000);
    return () => { observer.disconnect(); window.clearTimeout(timer); };
  }, [pathname, hash]);

  return null;
}
