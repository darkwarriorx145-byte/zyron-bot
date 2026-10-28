function mainOwnerId() {
  return String(process.env.DEFAULT_OWNER_ID || '');
}

function mainAdminId() {
  return String(process.env.MAIN_ADMIN_DISCORD_ID || '');
}

function isMainOwner(userId) {
  const id = mainOwnerId();
  return Boolean(id) && String(userId) === id;
}

function isMainAdmin(userId) {
  const id = mainAdminId();
  return Boolean(id) && String(userId) === id;
}

function isProtectedUser(userId) {
  return isMainOwner(userId) || isMainAdmin(userId);
}

function protectedLabel(userId) {
  if (isMainOwner(userId)) return 'main owner';
  if (isMainAdmin(userId)) return 'main admin';
  return 'protected user';
}

module.exports = {
  mainOwnerId: mainOwnerId,
  mainAdminId: mainAdminId,
  isMainOwner: isMainOwner,
  isMainAdmin: isMainAdmin,
  isProtectedUser: isProtectedUser,
  protectedLabel: protectedLabel
};
