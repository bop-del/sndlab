import { VERSION } from '../version.js';

// The build number, pinned to the corner of the viewport. Fixed rather than in
// the header because the header scrolls away on a phone and this is exactly
// what one wants to read after a deploy.
export const VersionTag = {
    init(mount) {
        mount.textContent = VERSION;
        // Decoration for anyone reading the page rather than debugging it.
        mount.setAttribute('aria-hidden', 'true');
    },
};
