import { describe, it, expect } from 'vitest';
import { shuffleArray, findFolderByName, flattenBookmarksWithIds } from '../src/utils.js';

describe('utils.js', () => {
  describe('shuffleArray', () => {
    it('should return a new array with the same elements', () => {
      const input = [1, 2, 3, 4, 5];
      const result = shuffleArray(input);
      
      expect(result).not.toBe(input); // Should be a new reference
      expect(result).toHaveLength(input.length);
      expect(result).toEqual(expect.arrayContaining(input));
    });

    it('should eventually shuffle (probabilistic)', () => {
      const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const result = shuffleArray(input);
      // Small chance it could be the same, but very unlikely with 10 elements
      expect(result).not.toEqual(input);
    });
  });

  describe('findFolderByName', () => {
    const mockTree = [
      {
        title: 'Bookmarks Bar',
        children: [
          { title: 'Other', children: [] },
          {
            title: 'MyFeed',
            id: '123',
            children: [
              { title: 'Site A', url: 'https://a.com' }
            ]
          }
        ]
      }
    ];

    it('should find a folder by name', () => {
      const result = findFolderByName(mockTree, 'MyFeed');
      expect(result).not.toBeNull();
      expect(result.id).toBe('123');
      expect(result.title).toBe('MyFeed');
    });

    it('should return null if folder not found', () => {
      const result = findFolderByName(mockTree, 'NonExistent');
      expect(result).toBeNull();
    });

    it('should not find a bookmark with same name (only folders)', () => {
      const treeWithBookmark = [
        { title: 'MyFeed', url: 'https://myfeed.com' }
      ];
      const result = findFolderByName(treeWithBookmark, 'MyFeed');
      expect(result).toBeNull();
    });
  });

  describe('flattenBookmarksWithIds', () => {
    const mockNodes = [
      {
        title: 'Folder',
        children: [
          { id: '1', title: 'Site A', url: 'https://sitea.com' },
          { id: '2', title: 'Site B', url: 'https://siteb.com/path' },
          {
            title: 'Subfolder',
            children: [
              { id: '3', title: 'Site C', url: 'http://sitec.org' }
            ]
          },
          { id: '4', title: 'Invalid', url: 'ftp://not-supported.com' }
        ]
      }
    ];

    it('should flatten nested bookmarks and extract domains', () => {
      const result = flattenBookmarksWithIds(mockNodes);
      
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ id: '1', url: 'https://sitea.com', domain: 'sitea.com' });
      expect(result[1]).toEqual({ id: '2', url: 'https://siteb.com/path', domain: 'siteb.com' });
      expect(result[2]).toEqual({ id: '3', url: 'http://sitec.org', domain: 'sitec.org' });
    });

    it('should handle empty children', () => {
      const result = flattenBookmarksWithIds([{ title: 'Empty', children: [] }]);
      expect(result).toHaveLength(0);
    });
  });
});
