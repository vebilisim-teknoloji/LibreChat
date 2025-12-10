const bcrypt = require('bcryptjs');
const { User, Organization } = require('~/db/models');
const { logger } = require('@librechat/data-schemas');
const { SystemRoles } = require('librechat-data-provider');
const {
  createUser,
  deleteUserById,
  deleteMessages,
  deleteAllUserSessions,
  deleteAllSharedLinks,
  deleteFiles,
  deleteConvos,
  deletePresets,
} = require('~/models');
const { Transaction, Balance, Conversation } = require('~/db/models');
const { deleteToolCalls } = require('~/models/ToolCall');
const { deleteUserPluginAuth } = require('~/server/services/PluginService');

/**
 * Get organization details and statistics for the current user (Org Admin).
 * Returns comprehensive stats for the organization dashboard.
 */
const getOrganizationStats = async (req, res) => {
  try {
    const { user } = req;

    if (!user.organization) {
      return res.status(404).json({ message: 'User does not belong to an organization' });
    }

    const organization = await Organization.findById(user.organization);
    if (!organization) {
      return res.status(404).json({ message: 'Organization not found' });
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Get all org user IDs for conversation queries
    const orgUserIds = await User.find({ organization: organization._id }).distinct('_id');

    const [
      userCount,
      activeUsers,
      unlimitedUsers,
      expiringSoonUsers,
      adminCount,
      newUsersToday,
      newUsersThisWeek,
      newUsersThisMonth,
      recentUsers,
      totalConversations,
      conversationsToday,
      conversationsThisWeek,
    ] = await Promise.all([
      // Total users count
      User.countDocuments({ organization: organization._id }),

      // Active users (membership not expired)
      User.countDocuments({
        organization: organization._id,
        $or: [
          { membershipExpiresAt: { $exists: false } },
          { membershipExpiresAt: null },
          { membershipExpiresAt: { $gt: now } },
        ],
      }),

      // Users with unlimited membership
      User.countDocuments({
        organization: organization._id,
        $or: [
          { membershipExpiresAt: { $exists: false } },
          { membershipExpiresAt: null },
        ],
      }),

      // Users expiring in the next 7 days
      User.countDocuments({
        organization: organization._id,
        membershipExpiresAt: { $gt: now, $lte: sevenDaysLater },
      }),

      // Count admins in this organization
      User.countDocuments({
        organization: organization._id,
        role: SystemRoles.ORG_ADMIN,
      }),

      // New users today
      User.countDocuments({
        organization: organization._id,
        createdAt: { $gte: today },
      }),

      // New users this week
      User.countDocuments({
        organization: organization._id,
        createdAt: { $gte: thisWeek },
      }),

      // New users this month
      User.countDocuments({
        organization: organization._id,
        createdAt: { $gte: thisMonth },
      }),

      // Recent 5 users
      User.find({ organization: organization._id })
        .select('name email createdAt membershipExpiresAt role')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),

      // Total conversations by org users
      Conversation.countDocuments({ user: { $in: orgUserIds } }),

      // Conversations today
      Conversation.countDocuments({
        user: { $in: orgUserIds },
        createdAt: { $gte: today },
      }),

      // Conversations this week
      Conversation.countDocuments({
        user: { $in: orgUserIds },
        createdAt: { $gte: thisWeek },
      }),
    ]);

    const expiredUsers = userCount - activeUsers;

    // Get registrations by day for the last 7 days (for chart)
    const registrationsByDay = await User.aggregate([
      {
        $match: {
          organization: organization._id,
          createdAt: { $gte: thisWeek },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Get membership status distribution
    const membershipDistribution = {
      unlimited: unlimitedUsers,
      active: activeUsers - unlimitedUsers, // Active but has expiration date
      expiringSoon: expiringSoonUsers,
      expired: expiredUsers,
    };

    res.status(200).json({
      organization: {
        _id: organization._id,
        name: organization.name,
        code: organization.code,
        createdAt: organization.createdAt,
      },
      // User stats
      totalUsers: userCount,
      activeUsers,
      expiredUsers,
      adminCount,
      unlimitedUsers,
      expiringSoonUsers,
      membershipDistribution,
      // Growth stats
      growth: {
        newUsersToday,
        newUsersThisWeek,
        newUsersThisMonth,
      },
      // Activity stats
      activity: {
        totalConversations,
        conversationsToday,
        conversationsThisWeek,
      },
      // Recent users
      recentUsers,
      // Chart data
      registrationsByDay,
      // Timestamp
      timestamp: now.toISOString(),
    });
  } catch (error) {
    logger.error('[getOrganizationStats]', error);
    res.status(500).json({ message: 'Error fetching organization stats' });
  }
};

/**
 * Get all users belonging to the same organization as the Org Admin.
 */
const getOrganizationUsers = async (req, res) => {
  try {
    const { user } = req;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const search = req.query.search || '';
    const status = req.query.status || '';

    if (!user.organization) {
      return res.status(404).json({ message: 'User does not belong to an organization' });
    }

    const query = { organization: user.organization };

    // Apply status filter based on membership expiration
    const now = new Date();
    if (status === 'active') {
      // Active = no expiration OR expiration in future
      query.$or = [
        { membershipExpiresAt: { $exists: false } },
        { membershipExpiresAt: null },
        { membershipExpiresAt: { $gt: now } },
      ];
    } else if (status === 'expired') {
      // Expired = expiration date in the past
      query.membershipExpiresAt = { $lt: now };
    }

    if (search) {
      const searchConditions = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } },
      ];

      // Combine with existing $or if status filter added one
      if (query.$or) {
        query.$and = [{ $or: query.$or }, { $or: searchConditions }];
        delete query.$or;
      } else {
        query.$or = searchConditions;
      }
    }

    const users = await User.find(query)
      .select('-password -__v -totpSecret -backupCodes')
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 })
      .lean();

    const total = await User.countDocuments(query);

    res.status(200).json({
      users,
      page,
      pages: Math.ceil(total / limit),
      totalUsers: total,
    });
  } catch (error) {
    logger.error('[getOrganizationUsers]', error);
    res.status(500).json({ message: 'Error fetching organization users' });
  }
};

/**
 * Get a single user by ID within the organization.
 */
const getOrganizationUserById = async (req, res) => {
  try {
    const { userId } = req.params;
    const adminUser = req.user;

    if (!adminUser.organization) {
      return res.status(403).json({ message: 'Admin not in an organization' });
    }

    const targetUser = await User.findById(userId)
      .select('-password -__v -totpSecret -backupCodes')
      .lean();

    if (!targetUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Security check: Ensure target user belongs to the same org
    if (String(targetUser.organization) !== String(adminUser.organization)) {
      return res.status(403).json({ message: 'Unauthorized to access this user' });
    }

    res.status(200).json(targetUser);
  } catch (error) {
    logger.error('[getOrganizationUserById]', error);
    res.status(500).json({ message: 'Error fetching user' });
  }
};

/**
 * Update a user within the organization (Org Admin only).
 */
const updateOrganizationUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { membershipExpiresAt, name } = req.body;
    const adminUser = req.user;

    if (!adminUser.organization) {
      return res.status(403).json({ message: 'Admin not in an organization' });
    }

    const targetUser = await User.findById(userId);

    if (!targetUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Security check: Ensure target user belongs to the same org
    if (String(targetUser.organization) !== String(adminUser.organization)) {
      return res.status(403).json({ message: 'Unauthorized to access this user' });
    }

    const updates = {};
    if (membershipExpiresAt !== undefined) {
      updates.membershipExpiresAt = membershipExpiresAt ? new Date(membershipExpiresAt) : null;
    }
    if (name !== undefined) {
      updates.name = name;
    }

    const updatedUser = await User.findByIdAndUpdate(userId, { $set: updates }, { new: true })
      .select('-password -__v -totpSecret -backupCodes')
      .lean();

    res.status(200).json(updatedUser);
  } catch (error) {
    logger.error('[updateOrganizationUser]', error);
    res.status(500).json({ message: 'Error updating user' });
  }
};

/**
 * Create a new user within the organization.
 */
const createOrganizationUser = async (req, res) => {
  try {
    const { email, name, username, password, membershipExpiresAt } = req.body;
    const adminUser = req.user;

    if (!adminUser.organization) {
      return res.status(403).json({ message: 'Admin not in an organization' });
    }

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // Check for existing user
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }

    // Check username uniqueness if provided
    const finalUsername = username || email.split('@')[0];
    const existingUsername = await User.findOne({ username: finalUsername });
    if (existingUsername) {
      return res.status(400).json({ message: 'Username is already taken' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user data
    const userData = {
      email: email.toLowerCase(),
      name: name || finalUsername,
      username: finalUsername,
      password: hashedPassword,
      organization: adminUser.organization,
      role: SystemRoles.USER,
      provider: 'local',
      emailVerified: true, // Auto-verify org-created users
      membershipVisible: true,
    };

    // Set expiration if provided
    if (membershipExpiresAt) {
      userData.membershipExpiresAt = new Date(membershipExpiresAt);
    }

    const newUser = await createUser(userData);

    // Return user without sensitive fields
    const userResponse = {
      _id: newUser._id,
      email: newUser.email,
      name: newUser.name,
      username: newUser.username,
      role: newUser.role,
      organization: newUser.organization,
      membershipExpiresAt: newUser.membershipExpiresAt,
      createdAt: newUser.createdAt,
    };

    logger.info(
      `[createOrganizationUser] Org Admin ${adminUser.email} created user: ${newUser.email}`,
    );

    res.status(201).json({ message: 'User created successfully', user: userResponse });
  } catch (error) {
    logger.error('[createOrganizationUser]', error);
    res.status(500).json({ message: 'Error creating user' });
  }
};

/**
 * Delete a user from the organization with full resource cleanup.
 */
const deleteOrganizationUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const adminUser = req.user;

    if (!adminUser.organization) {
      return res.status(403).json({ message: 'Admin not in an organization' });
    }

    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Security check: Ensure target user belongs to the same org
    if (String(targetUser.organization) !== String(adminUser.organization)) {
      return res.status(403).json({ message: 'Unauthorized to delete this user' });
    }

    // Prevent deleting self
    if (String(targetUser._id) === String(adminUser._id)) {
      return res.status(400).json({ message: 'Cannot delete your own account' });
    }

    // Prevent deleting other ORG_ADMINs (only global admin should do this)
    if (targetUser.role === SystemRoles.ORG_ADMIN) {
      return res.status(403).json({ message: 'Cannot delete organization admins' });
    }

    // Cleanup all user resources (same as AdminController)
    await Promise.all([
      deleteMessages({ user: userId }).catch((err) =>
        logger.warn(`[deleteOrganizationUser] Error deleting messages: ${err.message}`),
      ),
      deleteAllUserSessions(userId).catch((err) =>
        logger.warn(`[deleteOrganizationUser] Error deleting sessions: ${err.message}`),
      ),
      Transaction.deleteMany({ user: userId }).catch((err) =>
        logger.warn(`[deleteOrganizationUser] Error deleting transactions: ${err.message}`),
      ),
      Balance.deleteMany({ user: userId }).catch((err) =>
        logger.warn(`[deleteOrganizationUser] Error deleting balance: ${err.message}`),
      ),
      deletePresets(userId).catch((err) =>
        logger.warn(`[deleteOrganizationUser] Error deleting presets: ${err.message}`),
      ),
      deleteConvos(userId).catch((err) =>
        logger.warn(`[deleteOrganizationUser] Error deleting conversations: ${err.message}`),
      ),
      deleteUserPluginAuth(userId, null, true).catch((err) =>
        logger.warn(`[deleteOrganizationUser] Error deleting plugin auth: ${err.message}`),
      ),
      deleteAllSharedLinks(userId).catch((err) =>
        logger.warn(`[deleteOrganizationUser] Error deleting shared links: ${err.message}`),
      ),
      deleteFiles(null, userId).catch((err) =>
        logger.warn(`[deleteOrganizationUser] Error deleting files: ${err.message}`),
      ),
      deleteToolCalls(userId).catch((err) =>
        logger.warn(`[deleteOrganizationUser] Error deleting tool calls: ${err.message}`),
      ),
    ]);

    // Finally delete the user
    await deleteUserById(userId);

    logger.info(
      `[deleteOrganizationUser] Org Admin ${adminUser.email} deleted user: ${targetUser.email} (ID: ${userId})`,
    );

    res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    logger.error('[deleteOrganizationUser]', error);
    res.status(500).json({ message: 'Error deleting user' });
  }
};

/**
 * Reset password for a user within the organization.
 */
const resetOrganizationUserPassword = async (req, res) => {
  try {
    const { userId } = req.params;
    const { password } = req.body;
    const adminUser = req.user;

    if (!adminUser.organization) {
      return res.status(403).json({ message: 'Admin not in an organization' });
    }

    if (!password || password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    const targetUser = await User.findById(userId);

    if (!targetUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Security check: Ensure target user belongs to the same org
    if (String(targetUser.organization) !== String(adminUser.organization)) {
      return res.status(403).json({ message: 'Unauthorized to access this user' });
    }

    // Prevent resetting ORG_ADMIN passwords (security measure)
    if (targetUser.role === SystemRoles.ORG_ADMIN) {
      return res.status(403).json({ message: 'Cannot reset admin passwords' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Update user password
    await User.findByIdAndUpdate(userId, { password: hashedPassword });

    // Invalidate all sessions for the user
    await deleteAllUserSessions(userId);

    logger.info(
      `[resetOrganizationUserPassword] Org Admin ${adminUser.email} reset password for: ${targetUser.email}`,
    );

    res.status(200).json({ message: 'Password reset successfully' });
  } catch (error) {
    logger.error('[resetOrganizationUserPassword]', error);
    res.status(500).json({ message: 'Error resetting password' });
  }
};

/**
 * Add existing user to organization by email (Org Admin only).
 * Security: ORG_ADMIN can only add users by email, cannot browse other users.
 */
const addUserToOrganizationByEmail = async (req, res) => {
  try {
    const { email } = req.body;
    const adminUser = req.user;

    if (!adminUser.organization) {
      return res.status(403).json({ message: 'Admin not in an organization' });
    }

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    // Find user by email
    const targetUser = await User.findOne({ email: email.toLowerCase() });

    if (!targetUser) {
      return res.status(404).json({ message: 'User with this email not found' });
    }

    // Check if user is already in an organization
    if (targetUser.organization) {
      if (String(targetUser.organization) === String(adminUser.organization)) {
        return res.status(400).json({ message: 'User is already a member of your organization' });
      }
      return res.status(400).json({ message: 'User is already a member of another organization' });
    }

    // Prevent adding ADMIN users to organization
    if (targetUser.role === SystemRoles.ADMIN) {
      return res.status(403).json({ message: 'Cannot add system administrators to organization' });
    }

    // Get organization details
    const organization = await Organization.findById(adminUser.organization);
    if (!organization) {
      return res.status(404).json({ message: 'Organization not found' });
    }

    // Add user to organization
    const updatedUser = await User.findByIdAndUpdate(
      targetUser._id,
      { organization: adminUser.organization },
      { new: true, select: '-password -__v -totpSecret -backupCodes' }
    ).lean();

    logger.info(
      `[addUserToOrganizationByEmail] Org Admin ${adminUser.email} added user ${targetUser.email} to organization ${organization.name}`,
    );

    res.status(200).json({
      message: 'User added to organization successfully',
      user: {
        _id: updatedUser._id,
        email: updatedUser.email,
        name: updatedUser.name,
        username: updatedUser.username,
        role: updatedUser.role,
        organization: updatedUser.organization,
        membershipExpiresAt: updatedUser.membershipExpiresAt,
        createdAt: updatedUser.createdAt,
      },
    });
  } catch (error) {
    logger.error('[addUserToOrganizationByEmail]', error);
    res.status(500).json({ message: 'Error adding user to organization' });
  }
};

/**
 * Remove user from organization (Org Admin only).
 * Only removes from organization, does not delete the user.
 */
const removeUserFromOrganization = async (req, res) => {
  try {
    const { userId } = req.params;
    const adminUser = req.user;

    if (!adminUser.organization) {
      return res.status(403).json({ message: 'Admin not in an organization' });
    }

    const targetUser = await User.findById(userId);

    if (!targetUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Security check: Ensure target user belongs to the same org
    if (String(targetUser.organization) !== String(adminUser.organization)) {
      return res.status(403).json({ message: 'User is not a member of your organization' });
    }

    // Prevent removing self
    if (String(targetUser._id) === String(adminUser._id)) {
      return res.status(400).json({ message: 'Cannot remove yourself from organization' });
    }

    // Prevent removing other ORG_ADMINs
    if (targetUser.role === SystemRoles.ORG_ADMIN) {
      return res.status(403).json({ message: 'Cannot remove organization admins' });
    }

    // Get organization details for logging
    const organization = await Organization.findById(adminUser.organization);

    // Remove organization from user
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $unset: { organization: 1 } },
      { new: true, select: '-password -__v -totpSecret -backupCodes' }
    ).lean();

    logger.info(
      `[removeUserFromOrganization] Org Admin ${adminUser.email} removed user ${targetUser.email} from organization ${organization?.name || adminUser.organization}`,
    );

    res.status(200).json({
      message: 'User removed from organization successfully',
      user: updatedUser,
    });
  } catch (error) {
    logger.error('[removeUserFromOrganization]', error);
    res.status(500).json({ message: 'Error removing user from organization' });
  }
};

module.exports = {
  getOrganizationStats,
  getOrganizationUsers,
  getOrganizationUserById,
  updateOrganizationUser,
  createOrganizationUser,
  deleteOrganizationUser,
  resetOrganizationUserPassword,
  addUserToOrganizationByEmail,
  removeUserFromOrganization,
};
