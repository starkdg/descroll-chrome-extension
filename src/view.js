/**
 * Applies a theme to the document.
 */
export function applyTheme(theme) {
    if (theme === 'light' || theme === 'dark') {
        document.documentElement.setAttribute('data-theme', theme);
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
}

/**
 * View module for DeScroll. Handles all DOM-related operations and UI state.
 */
export class FeedView {
    constructor() {
        this.container = document.getElementById('feed-container');
        this.sentinel = document.getElementById('sentinel');
        this.onboarding = document.getElementById('onboarding-container');
        this.app = document.getElementById('app');
        this.onboardingError = document.getElementById('onboarding-error');
        this.startOnboardingBtn = document.getElementById('start-onboarding');
        this.folderInput = document.getElementById('onboarding-folder');
        this.observer = null;

	// card observer to observe when card is in view
	this.cardObserver = new IntersectionObserver((entries) => {
	    entries.forEach(entry => {
		// Callback fires when threshold is crossed. 
		// isIntersecting ensures we mark it when entering, not leaving.
		if (entry.isIntersecting) {
		    const url = entry.target.getAttribute('data-url');
		    if (this.onMarkSeenCallback) {
			this.onMarkSeenCallback(url);
		    }
		    // Stop observing once it has been marked seen
		    this.cardObserver.unobserve(entry.target);
		}
	    });
	}, { threshold: 0.5 });

	// Global listener to close menus
        document.addEventListener('click', () => this.closeAllMenus());
    }

    closeAllMenus() {
        document.querySelectorAll('.options-menu').forEach(menu => {
            menu.style.display = 'none';
        });
    }

    /**
     * Sets the tab's title and favicon.
     */
    setFavicon(title = "DeScroll - Your Feed") {
        document.title = title;
        const link = document.querySelector("link[rel*='icon']") || document.createElement('link');
        link.type = 'image/png';
        link.rel = 'shortcut icon';
        link.href = chrome.runtime.getURL('icons/icon-32.png');
        if (!link.parentNode) document.head.appendChild(link);
    }

    /**
     * Renders skeleton cards into the feed container.
     */
    renderSkeletons(count = 5) {
        for (let i = 0; i < count; i++) {
            const skeleton = document.createElement('div');
            skeleton.className = 'skeleton-card';
            skeleton.innerHTML = `
                <div class="skeleton-image"></div>
                <div class="skeleton-content">
                    <div class="skeleton-header">
                        <div class="skeleton-favicon"></div>
                        <div class="skeleton-domain"></div>
                    </div>
                    <div class="skeleton-title"></div>
                    <div class="skeleton-title short"></div>
                    <div class="skeleton-date"></div>
                </div>
            `;
            this.container.appendChild(skeleton);
        }
    }

    clearSkeletons() {
        const skeletons = this.container.querySelectorAll('.skeleton-card');
        skeletons.forEach(s => s.remove());
    }

    /**
     * Displays a helpful message when the feed is empty.
     */
    showEmptyState(info) {
        this.sentinel.style.display = 'none';

        let title = 'Your feed is waiting.';
        let message = '';
        let cta = '';

        if (!info || info.status === 'folder_not_found') {
            title = 'Folder not found.';
            message = `We couldn't find a bookmark folder named "<strong>${info?.folderName || 'MyFeed'}</strong>".`;
            cta = 'Go to <a href="options.html">Settings</a> to choose a different folder, or create a folder with that name in your bookmarks.';
        } else if (info.status === 'folder_empty') {
            title = 'Folder is empty.';
            message = `Your "<strong>${info.folderName}</strong>" folder currently has no bookmarks.`;
            cta = 'Add some websites to this folder to see their latest content here.';
        } else if (info.status === 'caught_up') {
            title = 'All caught up!';
            message = "You've seen everything for now. Fresh content will appear as your sources update.";
            cta = 'Check back later or add more sources to your bookmarks.';
        } else if (info.discoveryCount === 0) {
            title = 'No feeds discovered.';
            message = `We found ${info.bookmarkCount} bookmarks in "<strong>${info.folderName}</strong>", but none of them seem to have RSS feeds or sitemaps.`;
            cta = 'Try adding different sources or check your folder settings.';
        } else {
            title = 'Your feed is empty.';
            message = info.message || 'We couldn\'t find any content to display.';
            cta = 'Check your bookmark settings or check back later.';
        }

        this.container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🌱</div>
                <h2>${title}</h2>
                <p>${message}</p>
                <div class="cta-box">${cta}</div>
            </div>
        `;
    }

    /**
     * Shows the onboarding overlay.
     */
    showOnboarding(onStart) {
        this.onboarding.style.display = 'flex';
        this.app.style.filter = 'blur(10px)';
        this.app.style.pointerEvents = 'none';

        this.startOnboardingBtn.onclick = async () => {
            const folderName = this.folderInput.value.trim() || 'MyFeed';
            this.onboardingError.style.display = 'none';
            this.startOnboardingBtn.disabled = true;
            const originalText = this.startOnboardingBtn.textContent;
            this.startOnboardingBtn.textContent = "Checking your bookmarks...";

            try {
                const success = await onStart(folderName);
                if (!success) {
                    this.startOnboardingBtn.disabled = false;
                    this.startOnboardingBtn.textContent = originalText;
                }
            } catch (err) {
                this.showOnboardingError(err.message || "An unexpected error occurred.");
                this.startOnboardingBtn.disabled = false;
                this.startOnboardingBtn.textContent = originalText;
            }
        };
    }

    hideOnboarding() {
        this.onboarding.style.display = 'none';
        this.app.style.filter = 'none';
        this.app.style.pointerEvents = 'auto';
    }

    showOnboardingError(message) {
        this.onboardingError.textContent = message;
        this.onboardingError.style.display = 'block';
    }

    /**
     * Displays a small, dismissible hint at the top of the feed.
     */
    showFeedHint(message) {
        const hint = document.createElement('div');
        hint.className = 'feed-hint';
        hint.innerHTML = `
            <span>${message}</span>
            <button class="close-hint" aria-label="Dismiss hint">×</button>
        `;
        
        hint.querySelector('.close-hint').onclick = () => {
            hint.style.opacity = '0';
            hint.style.height = '0';
            hint.style.margin = '0';
            hint.style.padding = '0';
            setTimeout(() => hint.remove(), 300);
        };

        // Insert at the beginning of the container
        this.container.prepend(hint);
    }

    /**
     * Prepares for feed rendering.
     */
    prepareFeed(skeletonCount = 5) {
        this.container.innerHTML = '';
        this.sentinel.style.display = 'flex';
        this.sentinel.innerHTML = '';
        this.renderSkeletons(skeletonCount);
    }

    /**
     * Appends a batch of items to the container.
     */
    appendBatch(items, callbacks) {
        this.onMarkSeenCallback = callbacks.onMarkSeen;
        items.forEach(item => {
            const card = this.createCard(item, callbacks);
            card.setAttribute('data-url', item.url); // Attach the URL for identification
            this.container.appendChild(card);

            // Observe the card to mark it seen when it comes into view
            this.cardObserver.observe(card);
        });
    }

    updateSentinel(hasMore, message = 'Looking for more items...') {
        if (hasMore) {
            this.sentinel.innerHTML = `<span>${message}</span>`;
            this.sentinel.style.display = 'flex';
        } else {
            this.sentinel.innerHTML = '<span>You\'ve seen everything for now. Come back later!</span>';
        }
    }

    showSentinelError(message) {
        this.sentinel.textContent = message;
    }

    /**
     * Creates a single card element.
     */
    createCard(item, callbacks) {
        const card = document.createElement('div');
        card.className = `card-wrapper`;
        const titleId = `title-${Math.random().toString(36).substr(2, 9)}`;
        const domainUrl = `https://${item.domain}`;
        
        // Use cached favicon if available, fallback to Chrome's favicon API
        const faviconUrl = item.faviconData || `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(domainUrl)}&size=32`;
        const faviconUrlLarge = `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(domainUrl)}&size=64`;

        const hasImage = !!item.image;
        const imageHtml = hasImage ? `
            <div class="card-image">
                <img src="${item.image}" alt="Article image for ${item.title}" class="main-image">
            </div>
        ` : `
            <div class="card-image fallback">
                <img src="${faviconUrlLarge}" alt="Logo for ${item.domain}" class="favicon-hero">
            </div>
        `;

        const colors = ['#3498db', '#e74c3c', '#2ecc71', '#f1c40f', '#9b59b6', '#1abc9c', '#e67e22'];
        const colorIndex = Math.abs(item.domain.split('').reduce((a, b) => (a << 5) - a + b.charCodeAt(0), 0)) % colors.length;
        const brandColor = colors[colorIndex];

        let dateHtml = '';
        if (item.date) {
            const dateObj = new Date(item.date);
            if (!isNaN(dateObj.getTime())) {
                const dateStr = dateObj.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
                dateHtml = `<div class="date" aria-label="Published on ${dateStr}">${dateStr}</div>`;
            }
        }

        card.innerHTML = `
            <a class="card ${item.type} ${hasImage ? '' : 'no-image'}" href="${item.url}" target="_blank" aria-labelledby="${titleId}">
                ${imageHtml}
                <div class="card-content">
                    <div class="card-header">
                        <img src="${faviconUrl}" class="favicon" alt="">
                        <div class="favicon-placeholder" style="display: none; background-color: ${brandColor}">${item.domain[0].toUpperCase()}</div>
                        <span class="domain" aria-label="Source: ${item.domain}">${item.domain}</span>
                    </div>
                    <h3 class="title" id="${titleId}">${item.title}</h3>
                    ${dateHtml}
                    ${item.snippet ? `<p class="snippet">${item.snippet}</p>` : ''}
                    <span class="badge ${item.type}" aria-label="Content type: ${item.type}">${item.type.toUpperCase()}</span>
                </div>
            </a>
            <button class="card-options" aria-label="Options for ${item.title}">⋮</button>
            <div class="options-menu" style="display: none;" role="menu">
                <button class="remove-option" role="menuitem">Remove from feed</button>
                <button class="delete-bookmark-option" role="menuitem">Delete bookmark</button>
            </div>
        `;

        // Image & Favicon error handling
        const mainImg = card.querySelector('.main-image');
        if (mainImg) {
            mainImg.onerror = () => {
                mainImg.className = 'fallback-active';
                mainImg.src = faviconUrlLarge;
            };
        }
        const faviconImg = card.querySelector('.favicon');
        if (faviconImg) {
            faviconImg.onerror = () => {
                faviconImg.style.display = 'none';
                card.querySelector('.favicon-placeholder').style.display = 'flex';
            };
        }

        card.querySelector('a.card').onclick = () => {
            if (callbacks.onClick) callbacks.onClick(item);
        };

        // Options menu handling
        const optionsBtn = card.querySelector('.card-options');
        const menu = card.querySelector('.options-menu');
        
        optionsBtn.onclick = (e) => {
            e.stopPropagation();
            const isVisible = menu.style.display === 'block';
            this.closeAllMenus();
            if (!isVisible) menu.style.display = 'block';
        };

        card.querySelector('.remove-option').onclick = (e) => {
            e.stopPropagation();
            card.style.opacity = '0';
            card.style.transform = 'scale(0.9)';
            setTimeout(() => card.remove(), 200);
            if (callbacks.onRemove) callbacks.onRemove(item);
        };

        card.querySelector('.delete-bookmark-option').onclick = (e) => {
            e.stopPropagation();
            this.closeAllMenus();
            if (callbacks.onDeleteBookmark) callbacks.onDeleteBookmark(item);
        };

        return card;
    }

    removeCardsByDomain(domain) {
        this.container.querySelectorAll('.card-wrapper').forEach(cw => {
            const domainSpan = cw.querySelector('.domain');
            if (domainSpan && domainSpan.textContent === domain) {
                cw.style.opacity = '0';
                cw.style.transform = 'scale(0.9)';
                setTimeout(() => cw.remove(), 200);
            }
        });
    }

    setupInfiniteScroll(onLoadMore) {
        if (this.observer) this.observer.disconnect();

        this.observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                onLoadMore();
            }
        }, { threshold: 0.1 });
        this.observer.observe(this.sentinel);
    }
}
