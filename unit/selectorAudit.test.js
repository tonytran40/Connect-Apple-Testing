const test = require('node:test');
const assert = require('node:assert/strict');

const {
  auditSelectors,
  extractAccessibilityIdentifiers,
} = require('../scripts/auditAppAccessibility');
const { A11Y, SELECTORS, SELECTOR_METADATA } = require('../utils/selectors');

test('conversation search and bookmarks selectors match source-backed identifiers', () => {
  assert.equal(A11Y.conversationSearchField, 'conversationSearchField');
  assert.equal(SELECTORS.conversationSearchField, '~conversationSearchField');
  assert.equal(SELECTORS.conversationSearch, SELECTORS.conversationSearchField);
  assert.equal(SELECTORS.bookmarksScrollView, '~bookmarksScrollView');
});

test('selector metadata documents aliases and non-literal selector contracts', () => {
  assert.equal(SELECTOR_METADATA.conversationSearch.source, 'alias');
  assert.equal(SELECTOR_METADATA.roomsSectionHeader.source, 'dynamic');
  assert.equal(SELECTOR_METADATA.roomsHeaderButton.source, 'text');
  assert.deepEqual(SELECTOR_METADATA.messageActionsMore.platforms, ['macOS']);
});

test('extractAccessibilityIdentifiers reads direct and constant-backed Swift modifiers', () => {
  const source = String.raw`
    private let listAccessibilityID = "bookmarksScrollView"
    private let unusedAccessibilityID = "notAttached"

    Text("A").accessibilityIdentifier("directIdentifier")
    Text("B").accessibility(identifier: "alternateModifier")
    Text("C").accessibilityIdentifier(listAccessibilityID)
    Text("D").accessibilityIdentifier("\(label) section header")
  `;

  assert.deepEqual(
    [...extractAccessibilityIdentifiers(source)].sort(),
    ['alternateModifier', 'bookmarksScrollView', 'directIdentifier']
  );
});

test('audit marks only missing exact selectors as stale', () => {
  const identifiers = new Map([['presentIdentifier', ['Present.swift']]]);
  const selectorValues = {
    present: 'presentIdentifier',
    missing: 'missingIdentifier',
    dynamic: 'runtimeIdentifier',
    legacyPlatform: 'legacyIdentifier',
  };
  const metadata = {
    dynamic: { source: 'dynamic', pattern: '<runtime>' },
    legacyPlatform: { source: 'platform', platforms: ['legacy iOS builds'] },
  };

  const result = auditSelectors(identifiers, selectorValues, metadata);

  assert.deepEqual(result.exactMatches.map(item => item.key), ['present']);
  assert.deepEqual(result.staleSelectors.map(item => item.key), ['missing']);
  assert.deepEqual(result.exceptions.map(item => item.key), ['dynamic', 'legacyPlatform']);
});
