/*
 * Deployment configuration for the static experience page.
 *
 * GitHub Pages replaces this file during its deploy workflow when the
 * VOICE_CLONE_BACKEND_ORIGIN repository variable is set. Keep the checked-in
 * value empty so the same files can be served by the backend container and
 * automatically use the container's own HTTPS origin.
 */
window.VOICE_CLONE_CONFIG = Object.assign({
  backendOrigin: "",
}, window.VOICE_CLONE_CONFIG || {});
