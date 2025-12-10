const express = require('express');
const {
  getAllUsersController,
  createUserController,
  resetUserPasswordController,
  updateUserController,
  updateUserRoleController,
  updateUserStatusController,
  banUserController,
  deleteUserAdminController,
  getUserByIdController,
} = require('~/server/controllers/AdminController.js');
const {
  getOrganizationUsers,
  getOrganizationUserById,
  createOrganizationUser,
  updateOrganizationUser,
  deleteOrganizationUser,
  resetOrganizationUserPassword,
  addUserToOrganizationByEmail,
  removeUserFromOrganization,
} = require('~/server/controllers/OrganizationController.js');
const {
  addUserToOrganizationController,
  removeUserFromOrganizationController,
} = require('~/server/controllers/AdminController.js');
const { requireJwtAuth } = require('~/server/middleware');
const { SystemRoles } = require('librechat-data-provider');
const { adminAudit } = require('~/server/middleware/auditLog.js');
const { adminRateLimits } = require('~/server/middleware/adminRateLimit.js');

const router = express.Router();

// Middleware to check for ADMIN or ORG_ADMIN role
const checkAccess = (req, res, next) => {
  if (req.user.role === SystemRoles.ADMIN || req.user.role === SystemRoles.ORG_ADMIN) {
    return next();
  }
  return res.status(403).json({ message: 'Forbidden' });
};

// All admin routes require authentication and valid role
router.use(requireJwtAuth);
router.use(checkAccess);
router.use(adminRateLimits.general);

/**
 * GET /api/admin/users
 * Get all users with pagination, filtering, and search
 */
router.get('/', adminAudit.viewUsers, (req, res, next) => {
  if (req.user.role === SystemRoles.ORG_ADMIN) {
    return getOrganizationUsers(req, res, next);
  }
  return getAllUsersController(req, res, next);
});

/**
 * POST /api/admin/users/organization/add
 * Add user to organization
 * - ADMIN: Can add any user to any organization (by userId + organizationId)
 * - ORG_ADMIN: Can only add users by email to their own organization
 * NOTE: This route MUST be defined BEFORE /:id routes to prevent "organization" being treated as an ID
 */
router.post('/organization/add', adminAudit.updateUserRole, (req, res, next) => {
  if (req.user.role === SystemRoles.ORG_ADMIN) {
    return addUserToOrganizationByEmail(req, res, next);
  }
  return addUserToOrganizationController(req, res, next);
});

/**
 * POST /api/admin/users/organization/remove
 * Remove user from organization
 * - ADMIN: Can remove any user from any organization
 * - ORG_ADMIN: Can only remove users from their own organization
 * NOTE: This route MUST be defined BEFORE /:id routes to prevent "organization" being treated as an ID
 */
router.post('/organization/remove', adminAudit.updateUserRole, (req, res, next) => {
  if (req.user.role === SystemRoles.ORG_ADMIN) {
    req.params.userId = req.body.userId;
    return removeUserFromOrganization(req, res, next);
  }
  return removeUserFromOrganizationController(req, res, next);
});

/**
 * GET /api/admin/users/:id
 * Get specific user by ID
 */
router.get('/:id', adminAudit.viewUserDetails, (req, res, next) => {
  if (req.user.role === SystemRoles.ORG_ADMIN) {
    req.params.userId = req.params.id;
    return getOrganizationUserById(req, res, next);
  }
  return getUserByIdController(req, res, next);
});

/**
 * POST /api/admin/users
 * Create new user
 */
router.post('/', adminRateLimits.createUser, adminAudit.createUser, (req, res, next) => {
  if (req.user.role === SystemRoles.ORG_ADMIN) {
    return createOrganizationUser(req, res, next);
  }
  return createUserController(req, res, next);
});

/**
 * PUT /api/admin/users/:id/password
 * Reset user password (admin action)
 */
router.put('/:id/password', adminAudit.updateUserRole, (req, res, next) => {
  if (req.user.role === SystemRoles.ORG_ADMIN) {
    req.params.userId = req.params.id;
    return resetOrganizationUserPassword(req, res, next);
  }
  return resetUserPasswordController(req, res, next);
});

/**
 * PUT /api/admin/users/:id/role
 * Update user role (ADMIN only)
 */
router.put('/:id/role', adminAudit.updateUserRole, (req, res, next) => {
  if (req.user.role === SystemRoles.ORG_ADMIN) {
    return res.status(403).json({ message: 'Org Admin cannot change roles' });
  }
  return updateUserRoleController(req, res, next);
});

/**
 * PUT /api/admin/users/:id/status
 * Update user status (ADMIN only - ORG_ADMIN uses expiration)
 */
router.put('/:id/status', adminAudit.banUser, (req, res, next) => {
  if (req.user.role === SystemRoles.ORG_ADMIN) {
    return res.status(403).json({ message: 'Use expiration to manage access' });
  }
  return updateUserStatusController(req, res, next);
});

/**
 * PUT /api/admin/users/:id/ban
 * Ban or unban user (ADMIN only)
 */
router.put('/:id/ban', adminAudit.banUser, (req, res, next) => {
  if (req.user.role === SystemRoles.ORG_ADMIN) {
    return res.status(403).json({ message: 'Use expiration to manage access' });
  }
  return banUserController(req, res, next);
});

/**
 * PUT /api/admin/users/:id
 * General user update (Name, Expiration, etc.)
 */
router.put('/:id', adminAudit.updateUserRole, (req, res, next) => {
  if (req.user.role === SystemRoles.ORG_ADMIN) {
    req.params.userId = req.params.id;
    return updateOrganizationUser(req, res, next);
  }
  return updateUserController(req, res, next);
});

/**
 * DELETE /api/admin/users/:id
 * Delete user
 */
router.delete('/:id', adminRateLimits.deleteUser, adminAudit.deleteUser, (req, res, next) => {
  if (req.user.role === SystemRoles.ORG_ADMIN) {
    req.params.userId = req.params.id;
    return deleteOrganizationUser(req, res, next);
  }
  return deleteUserAdminController(req, res, next);
});

module.exports = router;
