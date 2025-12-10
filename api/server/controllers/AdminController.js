const bcrypt = require('bcryptjs');
const { logger } = require('@librechat/data-schemas');
const { SystemRoles } = require('librechat-data-provider');
const { User, Organization } = require('~/db/models');
const {
  createUser,
  updateUser,
  deleteUserById,
  deleteMessages,
  deleteAllUserSessions,
  deleteAllSharedLinks,
  deleteFiles,
  deleteConvos,
  deletePresets,
} = require('~/models');
const { Transaction, Balance } = require('~/db/models');
const { normalizeHttpError } = require('@librechat/api');
const { deleteToolCalls } = require('~/models/ToolCall');
const { deleteUserKey } = require('~/server/services/UserService');
const { deleteUserPluginAuth } = require('~/server/services/PluginService');

/**
 * Get all users with pagination, filtering, and search
 */
const getAllUsersController = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      role = '',
      status = '',
      sortBy = 'createdAt',
      sortOrder = 'desc',
      organization = '',
    } = req.query;

    // Validate pagination parameters
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    // Build query filters
    const query = {};

    if (search) {
      query.$or = [
        { email: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } },
      ];
    }

    if (role && Object.values(SystemRoles).includes(role)) {
      query.role = role;
    }

    // Organization filter
    if (organization) {
      if (organization === 'none') {
        query.organization = { $exists: false };
      } else {
        query.organization = organization;
      }
    }

    if (status === 'banned') {
      query.banned = true;
    } else if (status === 'active') {
      query.banned = { $ne: true };
    } else if (status === 'expired') {
      // Users with expired membership
      query.membershipExpiresAt = { $lt: new Date() };
    } else if (status === 'expiring_soon') {
      // Users expiring within 7 days
      const now = new Date();
      const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      query.membershipExpiresAt = { $gt: now, $lte: sevenDaysLater };
    }

    // Build sort options - support more fields
    const sortOptions = {};
    const validSortFields = ['createdAt', 'email', 'username', 'role', 'name', 'membershipExpiresAt', 'lastLoginAt'];
    if (validSortFields.includes(sortBy)) {
      sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;
    } else {
      sortOptions.createdAt = -1; // Default sort
    }

    // Execute queries in parallel
    const [users, totalCount] = await Promise.all([
      User.find(query, '-password -totpSecret -backupCodes +banned')
        .sort(sortOptions)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      User.countDocuments(query),
    ]);

    const totalPages = Math.ceil(totalCount / limitNum);

    // Get unique organization IDs from users
    const orgIds = [...new Set(users.filter(u => u.organization).map(u => u.organization.toString()))];

    // Fetch organization names in bulk
    let orgMap = {};
    if (orgIds.length > 0) {
      const organizations = await Organization.find({ _id: { $in: orgIds } }).select('name').lean();
      orgMap = organizations.reduce((acc, org) => {
        acc[org._id.toString()] = org.name;
        return acc;
      }, {});
    }

    // Transform users data for frontend compatibility
    const transformedUsers = users.map(user => {
      // Handle undefined banned values (treat undefined as true = banned = needs approval)
      const isBanned = user.banned !== false; // undefined or true = banned
      const isEnabled = !isBanned;
      return {
        ...user,
        banned: isBanned, // Ensure banned is always boolean
        isEnabled: isEnabled, // Frontend expects isEnabled (opposite of banned)
        lastActivity: user.lastLoginAt || null, // Map lastLoginAt to lastActivity
        organizationName: user.organization ? orgMap[user.organization.toString()] || null : null,
      };
    });

    res.status(200).json({
      users: transformedUsers,
      totalUsers: totalCount,
      totalPages,
      currentPage: pageNum,
      pageSize: limitNum,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalCount,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
    });
  } catch (error) {
    logger.error('[getAllUsersController]', error);
    const { status, message } = normalizeHttpError(error);
    res.status(status).json({ message });
  }
};

/**
 * Get specific user by ID
 */
const getUserByIdController = async (req, res) => {
  try {
    const { id } = req.params;
    
    const user = await User.findById(id, '-password -totpSecret -backupCodes').lean();
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Transform user data for frontend compatibility
    const transformedUser = {
      ...user,
      isEnabled: !user.banned, // Frontend expects isEnabled (opposite of banned)
      lastActivity: user.lastLoginAt || null, // Map lastLoginAt to lastActivity
    };

    res.status(200).json({ user: transformedUser });
  } catch (error) {
    logger.error('[getUserByIdController]', error);
    const { status, message } = normalizeHttpError(error);
    res.status(status).json({ message });
  }
};

/**
 * Create new user
 */
const createUserController = async (req, res) => {
  try {
    const { email, password, username, name, role = SystemRoles.USER } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // Validate role
    if (!Object.values(SystemRoles).includes(role)) {
      return res.status(400).json({ message: 'Invalid role specified' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: 'User with this email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const userData = {
      email,
      password: hashedPassword,
      username,
      name,
      role,
      emailVerified: true, // Admin created users are pre-verified
    };

    const newUser = await createUser(userData);

    // Remove sensitive data from response
    // Handle both Mongoose document and plain object returns
    const userResponse = newUser.toObject ? { ...newUser.toObject() } : { ...newUser };
    delete userResponse.password;
    delete userResponse.totpSecret;
    delete userResponse.backupCodes;

    logger.info(`Admin ${req.user.email} created user: ${newUser.email}`);
    
    res.status(201).json({ 
      message: 'User created successfully',
      user: userResponse 
    });
  } catch (error) {
    logger.error('[createUserController]', error);
    const { status, message } = normalizeHttpError(error);
    res.status(status).json({ message });
  }
};

/**
 * Update user status (banned/active)
 */
const updateUserStatusController = async (req, res) => {
  try {
    const { id } = req.params;
    const { banned } = req.body;

    // Validate banned field
    if (typeof banned !== 'boolean') {
      return res.status(400).json({ message: 'Invalid status specified. Use true for banned, false for active.' });
    }

    // Prevent admin from banning themselves
    if (id === req.user.id) {
      return res.status(403).json({ message: 'Cannot change your own status' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prevent banning other admins
    if (user.role === SystemRoles.ADMIN && banned === true) {
      return res.status(403).json({ message: 'Cannot ban admin users' });
    }

    // Update user status
    const updatedUser = await User.findByIdAndUpdate(
      id,
      { banned },
      { new: true, select: '-password -__v -totpSecret -backupCodes +banned' }
    );

    // If user is being banned, invalidate all their active sessions
    if (banned === true) {
      try {
        const sessionResult = await deleteAllUserSessions(id);
        logger.info(`[updateUserStatusController] Deleted ${sessionResult.deletedCount || 0} sessions for banned user ${user.email}`);
      } catch (sessionError) {
        logger.error(`[updateUserStatusController] Error deleting sessions for banned user ${user.email}:`, sessionError);
        // Continue execution even if session deletion fails
      }
    }

    logger.info(`[updateUserStatusController] User ${user.email} status changed to ${banned ? 'banned' : 'active'} by admin ${req.user.email}`);

    const userResponse = {
      id: updatedUser._id,
      name: updatedUser.name,
      username: updatedUser.username,
      email: updatedUser.email,
      role: updatedUser.role,
      isEnabled: !updatedUser.banned,
      emailVerified: updatedUser.emailVerified,
      lastActivity: updatedUser.lastActivity || updatedUser.createdAt,
      createdAt: updatedUser.createdAt,
      banned: updatedUser.banned
    };

    res.json({
      message: `User ${banned ? 'banned' : 'activated'} successfully`,
      user: userResponse
    });
  } catch (error) {
    logger.error('[updateUserStatusController]', error);
    const { status, message } = normalizeHttpError(error);
    res.status(status).json({ message });
  }
};

/**
 * Reset user password (admin action)
 */
const resetUserPasswordController = async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    // Validate password
    if (!password || password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long' });
    }

    // Prevent admin from resetting other admin passwords
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.role === SystemRoles.ADMIN) {
      return res.status(403).json({ message: 'Cannot reset admin user passwords' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Update user password
    await User.findByIdAndUpdate(id, { password: hashedPassword });

    logger.info(`[resetUserPasswordController] Password reset for user ${user.email} by admin ${req.user.email}`);

    res.status(200).json({ 
      message: 'Password reset successfully',
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
      }
    });
  } catch (error) {
    logger.error('[resetUserPasswordController]', error);
    const { status, message } = normalizeHttpError(error);
    res.status(status).json({ message });
  }
};

/**
 * Update user role
 */
const updateUserRoleController = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    // Validate role
    if (!Object.values(SystemRoles).includes(role)) {
      return res.status(400).json({ message: 'Invalid role specified' });
    }

    // Prevent admin from changing their own role
    if (id === req.user.id) {
      return res.status(403).json({ message: 'Cannot change your own role' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const oldRole = user.role;
    user.role = role;
    await user.save();

    logger.info(`Admin ${req.user.email} changed role of ${user.email} from ${oldRole} to ${role}`);
    
    res.status(200).json({ 
      message: 'User role updated successfully',
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
      }
    });
  } catch (error) {
    logger.error('[updateUserRoleController]', error);
    const { status, message } = normalizeHttpError(error);
    res.status(status).json({ message });
  }
};

/**
 * Ban or unban user
 */
const banUserController = async (req, res) => {
  try {
    const { id } = req.params;
    const { banned, reason } = req.body;

    // Prevent admin from banning themselves
    if (id === req.user.id) {
      return res.status(403).json({ message: 'Cannot ban yourself' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prevent banning other admins
    if (user.role === SystemRoles.ADMIN) {
      return res.status(403).json({ message: 'Cannot ban admin users' });
    }

    const updateData = { banned: !!banned };
    if (reason) {
      updateData.banReason = reason;
    }

    await updateUser(id, updateData);

    // If banning user, delete their active sessions
    if (banned) {
      await deleteAllUserSessions({ userId: id });
    }

    logger.info(`Admin ${req.user.email} ${banned ? 'banned' : 'unbanned'} user: ${user.email}${reason ? ` (Reason: ${reason})` : ''}`);
    
    res.status(200).json({ 
      message: `User ${banned ? 'banned' : 'unbanned'} successfully`,
      user: {
        id: user._id,
        email: user.email,
        banned,
      }
    });
  } catch (error) {
    logger.error('[banUserController]', error);
    const { status, message } = normalizeHttpError(error);
    res.status(status).json({ message });
  }
};

/**
 * Generic user update (name, membershipExpiresAt, etc.)
 */
const updateUserController = async (req, res) => {
  try {
    const { id } = req.params;
    const { membershipExpiresAt, name } = req.body;

    // Prevent admin from modifying themselves through this endpoint
    if (id === req.user.id) {
      return res.status(403).json({ message: 'Cannot modify yourself through this endpoint' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prevent modifying other admins
    if (user.role === SystemRoles.ADMIN) {
      return res.status(403).json({ message: 'Cannot modify admin users' });
    }

    const updates = {};
    if (membershipExpiresAt !== undefined) {
      updates.membershipExpiresAt = membershipExpiresAt ? new Date(membershipExpiresAt) : null;
    }
    if (name !== undefined) {
      updates.name = name;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'No valid fields to update' });
    }

    const updatedUser = await User.findByIdAndUpdate(id, { $set: updates }, { new: true })
      .select('-password -__v -totpSecret -backupCodes')
      .lean();

    logger.info(`Admin ${req.user.email} updated user: ${user.email} - Fields: ${Object.keys(updates).join(', ')}`);

    res.status(200).json(updatedUser);
  } catch (error) {
    logger.error('[updateUserController]', error);
    const { status, message } = normalizeHttpError(error);
    res.status(status).json({ message });
  }
};

/**
 * Delete user (admin version with audit logging)
 */
const deleteUserAdminController = async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent admin from deleting themselves
    if (id === req.user.id) {
      return res.status(403).json({ message: 'Cannot delete yourself' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prevent deleting other admins
    if (user.role === SystemRoles.ADMIN) {
      return res.status(403).json({ message: 'Cannot delete admin users' });
    }

    // Comprehensive user data deletion
    await Promise.all([
      deleteMessages({ user: id }).catch(err => logger.warn(`[deleteUserAdminController] Error deleting messages: ${err.message}`)),
      deleteAllUserSessions({ userId: id }).catch(err => logger.warn(`[deleteUserAdminController] Error deleting sessions: ${err.message}`)),
      Transaction.deleteMany({ user: id }).catch(err => logger.warn(`[deleteUserAdminController] Error deleting transactions: ${err.message}`)),
      deleteUserKey({ userId: id, all: true }).catch(err => logger.warn(`[deleteUserAdminController] Error deleting user keys: ${err.message}`)),
      Balance.deleteMany({ user: id }).catch(err => logger.warn(`[deleteUserAdminController] Error deleting balance: ${err.message}`)),
      deletePresets(id).catch(err => logger.warn(`[deleteUserAdminController] Error deleting presets: ${err.message}`)),
      deleteConvos(id).catch(err => logger.warn(`[deleteUserAdminController] Error deleting conversations: ${err.message}`)),
      deleteUserPluginAuth(id, null, true).catch(err => logger.warn(`[deleteUserAdminController] Error deleting plugin auth: ${err.message}`)),
      deleteAllSharedLinks(id).catch(err => logger.warn(`[deleteUserAdminController] Error deleting shared links: ${err.message}`)),
      deleteFiles(null, id).catch(err => logger.warn(`[deleteUserAdminController] Error deleting files: ${err.message}`)),
      deleteToolCalls(id).catch(err => logger.warn(`[deleteUserAdminController] Error deleting tool calls: ${err.message}`)),
    ]);

    // Finally delete the user
    await deleteUserById(id);

    logger.info(`Admin ${req.user.email} deleted user: ${user.email} (ID: ${id})`);
    
    res.status(200).json({ 
      message: 'User deleted successfully'
    });
  } catch (error) {
    logger.error('[deleteUserAdminController]', error);
    const { status, message } = normalizeHttpError(error);
    res.status(status).json({ message });
  }
};

/**
 * Add user to organization (Admin only)
 * Admin can add any user to any organization
 */
const addUserToOrganizationController = async (req, res) => {
  try {
    const { userId, organizationId } = req.body;

    if (!userId || !organizationId) {
      return res.status(400).json({ message: 'User ID and Organization ID are required' });
    }

    // Verify user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Verify organization exists
    const organization = await Organization.findById(organizationId);
    if (!organization) {
      return res.status(404).json({ message: 'Organization not found' });
    }

    // Check if user is already in this organization
    if (user.organization && user.organization.toString() === organizationId) {
      return res.status(400).json({ message: 'User is already a member of this organization' });
    }

    // Update user's organization
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { organization: organizationId },
      { new: true, select: '-password -__v -totpSecret -backupCodes' }
    ).lean();

    logger.info(`[addUserToOrganizationController] Admin ${req.user.email} added user ${user.email} to organization ${organization.name}`);

    res.status(200).json({
      message: 'User added to organization successfully',
      user: {
        ...updatedUser,
        organizationName: organization.name,
      },
    });
  } catch (error) {
    logger.error('[addUserToOrganizationController]', error);
    const { status, message } = normalizeHttpError(error);
    res.status(status).json({ message });
  }
};

/**
 * Remove user from organization (Admin only)
 */
const removeUserFromOrganizationController = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    // Verify user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if user has an organization
    if (!user.organization) {
      return res.status(400).json({ message: 'User is not a member of any organization' });
    }

    const previousOrgId = user.organization;
    const previousOrg = await Organization.findById(previousOrgId);

    // Remove organization from user
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $unset: { organization: 1 } },
      { new: true, select: '-password -__v -totpSecret -backupCodes' }
    ).lean();

    logger.info(`[removeUserFromOrganizationController] Admin ${req.user.email} removed user ${user.email} from organization ${previousOrg?.name || previousOrgId}`);

    res.status(200).json({
      message: 'User removed from organization successfully',
      user: updatedUser,
    });
  } catch (error) {
    logger.error('[removeUserFromOrganizationController]', error);
    const { status, message } = normalizeHttpError(error);
    res.status(status).json({ message });
  }
};

module.exports = {
  getAllUsersController,
  getUserByIdController,
  createUserController,
  resetUserPasswordController,
  updateUserController,
  updateUserRoleController,
  updateUserStatusController,
  banUserController,
  deleteUserAdminController,
  addUserToOrganizationController,
  removeUserFromOrganizationController,
};