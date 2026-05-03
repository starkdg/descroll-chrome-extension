/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FeedView } from '../src/view.js';

describe('FeedView', () => {
    let view;

    beforeEach(() => {
        // Setup the DOM structure that the constructor expects
        document.body.innerHTML = `
            <div id="app"></div>
            <div id="feed-container"></div>
            <div id="sentinel"></div>
            <div id="onboarding-container" style="display: none;"></div>
            <div id="onboarding-error" style="display: none;"></div>
            <button id="start-onboarding"></button>
            <input id="onboarding-folder" value="MyFeed" />
        `;

        // Mock chrome APIs
        vi.stubGlobal('chrome', {
            runtime: { 
                getURL: vi.fn((path) => `chrome-extension://test-id/${path}`),
                id: 'test-id'
            }
        });

        // Mock IntersectionObserver as a class/constructor
        global.IntersectionObserver = vi.fn().mockImplementation(function() {
            this.observe = vi.fn();
            this.unobserve = vi.fn();
            this.disconnect = vi.fn();
        });

        view = new FeedView();
    });

    describe('Initialization', () => {
        it('should correctly select all required DOM elements', () => {
            expect(view.container).not.toBeNull();
            expect(view.sentinel).not.toBeNull();
            expect(view.onboarding).not.toBeNull();
            expect(view.app).not.toBeNull();
        });
    });

    describe('Favicon and Title', () => {
        it('should set the document title', () => {
            view.setFavicon('Custom Title');
            expect(document.title).toBe('Custom Title');
        });

        it('should create a favicon link if one does not exist', () => {
            view.setFavicon();
            const link = document.querySelector("link[rel*='icon']");
            expect(link).not.toBeNull();
            expect(link.href).toContain('icon-32.png');
        });
    });

    describe('Skeleton Loaders', () => {
        it('should render the requested number of skeletons', () => {
            view.renderSkeletons(5);
            const skeletons = view.container.querySelectorAll('.skeleton-card');
            expect(skeletons.length).toBe(5);
        });

        it('should clear all skeletons from the container', () => {
            view.renderSkeletons(3);
            view.clearSkeletons();
            const skeletons = view.container.querySelectorAll('.skeleton-card');
            expect(skeletons.length).toBe(0);
        });
    });

    describe('Empty States', () => {
        it('should show "folder_not_found" message', () => {
            view.showEmptyState({ status: 'folder_not_found', folderName: 'MissingFolder' });
            expect(view.container.innerHTML).toContain('Folder not found');
            expect(view.container.innerHTML).toContain('MissingFolder');
            expect(view.sentinel.style.display).toBe('none');
        });

        it('should show "caught_up" message', () => {
            view.showEmptyState({ status: 'caught_up' });
            expect(view.container.innerHTML).toContain('All caught up');
        });

        it('should show default empty state if no info provided', () => {
            view.showEmptyState();
            expect(view.container.innerHTML).toContain('Folder not found');
        });
    });

    describe('Onboarding UI', () => {
        it('should show onboarding and apply blur', () => {
            view.showOnboarding(() => {});
            expect(view.onboarding.style.display).toBe('flex');
            expect(view.app.style.filter).toBe('blur(10px)');
        });

        it('should hide onboarding and remove blur', () => {
            view.showOnboarding(() => {});
            view.hideOnboarding();
            expect(view.onboarding.style.display).toBe('none');
            expect(view.app.style.filter).toBe('none');
        });

        it('should display onboarding errors', () => {
            view.showOnboardingError('Something went wrong');
            expect(view.onboardingError.textContent).toBe('Something went wrong');
            expect(view.onboardingError.style.display).toBe('block');
        });
    });

    describe('Card Management', () => {
        const mockItem = {
            domain: 'example.com',
            url: 'https://example.com/post',
            title: 'Test Post',
            type: 'discovery',
            date: '2026-04-12',
            image: 'https://example.com/image.jpg'
        };

        it('should create a card with correct content', () => {
            const card = view.createCard(mockItem, {});
            expect(card.classList.contains('card-wrapper')).toBe(true);
            expect(card.querySelector('.title').textContent).toBe('Test Post');
            expect(card.querySelector('.domain').textContent).toBe('example.com');
            expect(card.querySelector('a').href).toBe('https://example.com/post');
        });

        it('should trigger onClick callback when the card link is clicked', () => {
            const onClick = vi.fn();
            const card = view.createCard(mockItem, { onClick });
            const link = card.querySelector('a.card');
            
            link.click();
            expect(onClick).toHaveBeenCalledWith(mockItem);
        });

        it('should remove cards by domain with animation delay', async () => {
            vi.useFakeTimers();
            const card1 = view.createCard(mockItem, {});
            const card2 = view.createCard({ ...mockItem, domain: 'other.com' }, {});
            
            view.container.appendChild(card1);
            view.container.appendChild(card2);

            view.removeCardsByDomain('example.com');

            // Verify opacity was set for the matching card
            expect(card1.style.opacity).toBe('0');
            expect(card2.style.opacity).not.toBe('0');

            // Fast-forward to after the 200ms timeout
            vi.advanceTimersByTime(250);
            
            expect(view.container.contains(card1)).toBe(false);
            expect(view.container.contains(card2)).toBe(true);
            vi.useRealTimers();
        });
    });

    describe('Sentinel and Infinite Scroll', () => {
        it('should update sentinel text for "hasMore"', () => {
            view.updateSentinel(true, 'Loading...');
            expect(view.sentinel.textContent).toBe('Loading...');
        });

        it('should update sentinel text for "no more items"', () => {
            view.updateSentinel(false);
            expect(view.sentinel.textContent).toContain('You\'ve seen everything');
        });

        it('should setup IntersectionObserver on the sentinel', () => {
            const callback = vi.fn();
            view.setupInfiniteScroll(callback);
            expect(global.IntersectionObserver).toHaveBeenCalled();
        });
    });
});
