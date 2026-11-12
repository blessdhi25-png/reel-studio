// Videos posted into a PRIVATE community must never surface outside it. Spread
// `AND: [notInPrivateCommunity]` into any public video listing (feed, search,
// trending, profile grids).
export const notInPrivateCommunity = {
  OR: [{ communityId: null }, { community: { privacy: 'public' } }],
};
