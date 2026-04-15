/**
 * General utility functions for DeScroll.
 */

/**
 * Fisher-Yates shuffle algorithm for unbiased randomization
 */
export function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

/**
 * Recursive search for a bookmark folder by name
 */
export function findFolderByName(nodes, name) {
    for (const node of nodes) {
        if (node.title === name && !node.url) return node;
        if (node.children) {
            const found = findFolderByName(node.children, name);
            if (found) return found;
        }
    }
    return null;
}

/**
 * Flattens bookmark tree and extracts IDs and domains
 */
export function flattenBookmarksWithIds(nodes, list = []) {
    for (const node of nodes) {
        if (node.url) {
            try {
                const url = new URL(node.url);
                if (url.protocol.startsWith('http')) {
                    list.push({
                        id: node.id,
                        url: node.url,
                        domain: url.hostname
                    });
                }
            } catch (e) {}
        }
        if (node.children) flattenBookmarksWithIds(node.children, list);
    }
    return list;
}
