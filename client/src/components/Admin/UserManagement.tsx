import { useState, useMemo } from 'react';
import {
  Users,
  Plus,
  Search,
  Loader2,
  AlertTriangle,
  Edit,
  Ban,
  Trash2,
  Shield,
  User,
  Clock,
  X,
  Building2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CalendarClock,
  UserPlus
} from 'lucide-react';
import {
  Button,
  Input,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from '@librechat/client';
import {
  useAdminUsersQuery,
  useUpdateUserStatusMutation,
  useAdminDeleteUserMutation,
  useResetUserPasswordMutation,
  useUpdateUserRoleMutation,
  useUpdateUserMutation,
  type TAdminUsersQueryParams
} from '~/data-provider';
import { useGetOrganizationsQuery } from '~/data-provider/Admin/organizations';
import { useLocalize } from '~/hooks';
import { useNavigate } from 'react-router-dom';
import UserCreationModal from './UserCreationModal';
import SetExpirationModal from './SetExpirationModal';
import AssignOrganizationModal from './AssignOrganizationModal';
import { useAuthContext } from '~/hooks/AuthContext';
import { SystemRoles } from 'librechat-data-provider';

type SortField = 'createdAt' | 'name' | 'email' | 'membershipExpiresAt' | 'lastLoginAt' | 'role';
type SortOrder = 'asc' | 'desc';

export default function UserManagement() {
  const localize = useLocalize();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'banned' | 'expired' | 'expiring_soon'>('all');
  const [roleFilter, setRoleFilter] = useState<'all' | 'USER' | 'ADMIN' | 'ORG_ADMIN'>('all');
  const [organizationFilter, setOrganizationFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const { user: currentUser } = useAuthContext();
  const isOrgAdmin = currentUser?.role === SystemRoles.ORG_ADMIN;

  // Fetch organizations for filter dropdown (only for global admin)
  const { data: organizationsData } = useGetOrganizationsQuery(
    { page: 1, limit: 100 },
    { enabled: !isOrgAdmin }
  );

  // Fetch users with current filters
  const {
    data: usersData,
    isLoading,
    error,
    refetch
  } = useAdminUsersQuery({
    page: currentPage,
    limit: pageSize,
    sortBy: sortField,
    sortOrder: sortOrder,
    search: searchTerm || undefined,
    status: statusFilter === 'all' ? undefined : statusFilter,
    role: roleFilter === 'all' ? undefined : roleFilter,
    organization: organizationFilter === 'all' ? undefined : organizationFilter,
  });

  // Mutations
  const updateUserStatusMutation = useUpdateUserStatusMutation();
  const deleteUserMutation = useAdminDeleteUserMutation();
  const resetPasswordMutation = useResetUserPasswordMutation();
  const updateUserRoleMutation = useUpdateUserRoleMutation();
  const updateUserMutation = useUpdateUserMutation();

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ userId: string; userEmail: string } | null>(null);
  const [passwordReset, setPasswordReset] = useState<{ userId: string; userEmail: string } | null>(null);
  const [roleChange, setRoleChange] = useState<{ userId: string; userEmail: string; currentRole: string; newRole: string } | null>(null);
  const [expirationChange, setExpirationChange] = useState<{ userId: string; userName: string; currentExpiresAt: string | null } | null>(null);
  const [organizationAssign, setOrganizationAssign] = useState<{ userId: string; userName: string; currentOrganizationId: string | null; currentOrganizationName: string | null } | null>(null);
  const [showAddUserByEmail, setShowAddUserByEmail] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [passwordErrors, setPasswordErrors] = useState<{ [key: string]: string }>({});

  // Handle search
  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1); // Reset to first page when searching
  };

  // ... (existing handlers)

  // Handle expiration change
  const handleExpirationChange = async (expirationDate: string | null) => {
    if (!expirationChange) return;
    await updateUserMutation.mutateAsync({
      userId: expirationChange.userId,
      membershipExpiresAt: expirationDate,
    });
    setExpirationChange(null);
  };


  // Handle filter changes
  const handleStatusFilter = (value: string) => {
    setStatusFilter(value as 'all' | 'active' | 'banned' | 'expired' | 'expiring_soon');
    setCurrentPage(1);
  };

  const handleRoleFilter = (value: string) => {
    setRoleFilter(value as 'all' | 'USER' | 'ADMIN' | 'ORG_ADMIN');
    setCurrentPage(1);
  };

  const handleOrganizationFilter = (value: string) => {
    setOrganizationFilter(value);
    setCurrentPage(1);
  };

  const handlePageSizeChange = (value: string) => {
    setPageSize(parseInt(value));
    setCurrentPage(1);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setStatusFilter('all');
    setRoleFilter('all');
    setOrganizationFilter('all');
    setSearchTerm('');
    setSortField('createdAt');
    setSortOrder('desc');
    setCurrentPage(1);
  };

  // Check if any filters are active
  const hasActiveFilters = statusFilter !== 'all' || roleFilter !== 'all' || organizationFilter !== 'all' || searchTerm !== '';

  // Get status filter label
  const getStatusFilterLabel = (status: string) => {
    switch (status) {
      case 'active': return localize('com_admin_active');
      case 'banned': return localize('com_admin_banned');
      case 'expired': return localize('com_admin_expired');
      case 'expiring_soon': return localize('com_admin_expiring_soon');
      default: return status;
    }
  };

  // Sortable column header component
  const SortableHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <th
      className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider cursor-pointer hover:bg-[var(--admin-row-hover)] transition-colors select-none"
      style={{ color: 'var(--admin-table-header-text)' }}
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        {sortField === field ? (
          sortOrder === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </div>
    </th>
  );

  // Handle user status toggle
  const handleStatusToggle = async (userId: string, isCurrentlyEnabled: boolean) => {
    const shouldBan = isCurrentlyEnabled;
    try {
      await updateUserStatusMutation.mutateAsync({
        userId,
        banned: shouldBan,
      });
    } catch (error) {

    }
  };

  // Handle user deletion
  const handleDeleteUser = async (userId: string) => {
    try {
      await deleteUserMutation.mutateAsync({
        userId,
      });
      setDeleteConfirm(null);
    } catch (error) {

    }
  };

  // Password validation function
  const validatePassword = (password: string) => {
    const errors: { [key: string]: string } = {};

    if (!password) {
      errors.required = localize('com_admin_password_required');
    } else {
      if (password.length < 8) {
        errors.minLength = localize('com_admin_password_min_length');
      }
      if (password.length > 128) {
        errors.maxLength = localize('com_admin_password_max_length');
      }
    }

    return errors;
  };

  // Handle password change with validation
  const handlePasswordChange = (value: string) => {
    setNewPassword(value);
    const errors = validatePassword(value);
    setPasswordErrors(errors);
  };

  // Handle password reset
  const handlePasswordReset = async () => {
    if (!passwordReset || !newPassword.trim()) return;

    // Final validation before submit
    const errors = validatePassword(newPassword);
    if (Object.keys(errors).length > 0) {
      setPasswordErrors(errors);
      return;
    }

    try {
      await resetPasswordMutation.mutateAsync({
        userId: passwordReset.userId,
        password: newPassword,
      });
      setPasswordReset(null);
      setNewPassword('');
      setPasswordErrors({});
    } catch (error) {
      // Error handled by React Query's onError callback
    }
  };

  // Handle role change
  const handleRoleChange = async (userId: string, currentRole: string, newRole: string) => {
    try {
      await updateUserRoleMutation.mutateAsync({
        userId,
        role: newRole,
      });
      setRoleChange(null);
    } catch (error) {
      // Error handled by React Query's onError callback
    }
  };

  // Check if user can be deleted/edited (not admin)
  const canDeleteUser = (user: any) => {
    return user.role !== 'ADMIN';
  };

  const canEditUser = (user: any) => {
    return user.role !== 'ADMIN';
  };

  // Handle user creation success
  const handleUserCreated = (user: any) => {
    // User list will be automatically updated by React Query
    // Optional: Show success message
  };

  // Handle pagination
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  return (
    <div className="space-y-6">
      {/* Page Header Card */}
      <div className="admin-header-card">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="admin-header-icon">
              <Users className="h-8 w-8" />
            </div>
            <div>
              <h1 className="admin-header-title">
                {localize('com_admin_user_management')}
              </h1>
              <p className="admin-header-description mt-1">
                {localize('com_admin_user_management_description')}
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            {isOrgAdmin && (
              <Button
                variant="default"
                size="default"
                onClick={() => setShowAddUserByEmail(true)}
                className="w-full bg-green-600 text-white border-green-600 hover:bg-green-700 sm:w-auto"
              >
                <UserPlus className="h-4 w-4" />
                {localize('com_admin_add_existing_user')}
              </Button>
            )}
            <Button
              variant="default"
              size="default"
              onClick={() => setShowCreateModal(true)}
              className="w-full bg-[var(--admin-header-icon-bg)] text-[var(--admin-header-text)] border-[var(--admin-header-icon-bg)] hover:bg-[var(--admin-header-icon-bg)]/80 sm:w-auto"
            >
              <Plus className="h-4 w-4" />
              {localize('com_admin_create_user')}
            </Button>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
            <Input
              type="text"
              placeholder={localize('com_admin_search_users')}
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-10 text-text-primary placeholder:text-text-tertiary"
            />
          </div>

          {/* Status Filter - different options for ORG_ADMIN vs global admin */}
          <div className="w-full sm:w-44">
            <Select value={statusFilter} onValueChange={handleStatusFilter}>
              <SelectTrigger className="text-text-primary">
                <SelectValue placeholder={localize('com_admin_status')} />
              </SelectTrigger>
              <SelectContent className="!bg-surface-primary !z-[100] !shadow-xl border border-border-medium">
                <SelectItem value="all" className="!bg-surface-primary !text-text-primary hover:!bg-surface-hover">
                  {localize('com_admin_all_users')}
                </SelectItem>
                <SelectItem value="active" className="!bg-surface-primary !text-text-primary hover:!bg-surface-hover">
                  {localize('com_admin_active')}
                </SelectItem>
                {isOrgAdmin ? (
                  <>
                    <SelectItem value="expired" className="!bg-surface-primary !text-text-primary hover:!bg-surface-hover">
                      {localize('com_admin_expired')}
                    </SelectItem>
                    <SelectItem value="expiring_soon" className="!bg-surface-primary !text-text-primary hover:!bg-surface-hover">
                      <span className="flex items-center gap-1">
                        <CalendarClock className="h-3 w-3" />
                        {localize('com_admin_expiring_soon')}
                      </span>
                    </SelectItem>
                  </>
                ) : (
                  <>
                    <SelectItem value="banned" className="!bg-surface-primary !text-text-primary hover:!bg-surface-hover">
                      {localize('com_admin_banned')}
                    </SelectItem>
                    <SelectItem value="expired" className="!bg-surface-primary !text-text-primary hover:!bg-surface-hover">
                      {localize('com_admin_expired')}
                    </SelectItem>
                    <SelectItem value="expiring_soon" className="!bg-surface-primary !text-text-primary hover:!bg-surface-hover">
                      <span className="flex items-center gap-1">
                        <CalendarClock className="h-3 w-3" />
                        {localize('com_admin_expiring_soon')}
                      </span>
                    </SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Role Filter - hidden for ORG_ADMIN */}
          {!isOrgAdmin && (
            <div className="w-full sm:w-40">
              <Select value={roleFilter} onValueChange={handleRoleFilter}>
                <SelectTrigger className="text-text-primary">
                  <SelectValue placeholder={localize('com_admin_role')} />
                </SelectTrigger>
                <SelectContent className="!bg-surface-primary !z-[100] !shadow-xl border border-border-medium">
                  <SelectItem value="all" className="!bg-surface-primary !text-text-primary hover:!bg-surface-hover">{localize('com_admin_all_roles')}</SelectItem>
                  <SelectItem value="USER" className="!bg-surface-primary !text-text-primary hover:!bg-surface-hover">{localize('com_admin_user_role')}</SelectItem>
                  <SelectItem value="ADMIN" className="!bg-surface-primary !text-text-primary hover:!bg-surface-hover">{localize('com_admin_admin_role')}</SelectItem>
                  <SelectItem value="ORG_ADMIN" className="!bg-surface-primary !text-text-primary hover:!bg-surface-hover">{localize('com_admin_org_admin_role')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Organization Filter - only for global admin */}
          {!isOrgAdmin && organizationsData?.organizations && organizationsData.organizations.length > 0 && (
            <div className="w-full sm:w-48">
              <Select value={organizationFilter} onValueChange={handleOrganizationFilter}>
                <SelectTrigger className="text-text-primary">
                  <SelectValue placeholder={localize('com_settings_organization')} />
                </SelectTrigger>
                <SelectContent className="!bg-surface-primary !z-[100] !shadow-xl border border-border-medium max-h-60">
                  <SelectItem value="all" className="!bg-surface-primary !text-text-primary hover:!bg-surface-hover">
                    {localize('com_admin_all_organizations')}
                  </SelectItem>
                  <SelectItem value="none" className="!bg-surface-primary !text-text-primary hover:!bg-surface-hover">
                    {localize('com_admin_no_organization')}
                  </SelectItem>
                  {organizationsData.organizations.map((org) => (
                    <SelectItem
                      key={org._id}
                      value={org._id}
                      className="!bg-surface-primary !text-text-primary hover:!bg-surface-hover"
                    >
                      {org.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Clear Filters Button */}
          {hasActiveFilters && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearFilters}
              className="whitespace-nowrap"
            >
              <X className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">{localize('com_admin_clear_filters')}</span>
            </Button>
          )}
        </div>

        {/* Active Filter Badges */}
        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-text-secondary">{localize('com_admin_active_filters')}:</span>
            {searchTerm && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-surface-secondary px-3 py-1 text-xs font-medium text-text-primary cursor-pointer transition-colors hover:bg-destructive/20"
                onClick={() => {
                  setSearchTerm('');
                  setCurrentPage(1);
                }}
              >
                {localize('com_admin_search')}: {searchTerm}
                <X className="h-3 w-3" />
              </span>
            )}
            {statusFilter !== 'all' && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-surface-secondary px-3 py-1 text-xs font-medium text-text-primary cursor-pointer transition-colors hover:bg-destructive/20"
                onClick={() => {
                  setStatusFilter('all');
                  setCurrentPage(1);
                }}
              >
                {localize('com_admin_status')}: {getStatusFilterLabel(statusFilter)}
                <X className="h-3 w-3" />
              </span>
            )}
            {roleFilter !== 'all' && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-surface-secondary px-3 py-1 text-xs font-medium text-text-primary cursor-pointer transition-colors hover:bg-destructive/20"
                onClick={() => {
                  setRoleFilter('all');
                  setCurrentPage(1);
                }}
              >
                {localize('com_admin_role')}: {roleFilter === 'USER' ? localize('com_admin_user_role') : roleFilter === 'ORG_ADMIN' ? localize('com_admin_org_admin_role') : localize('com_admin_admin_role')}
                <X className="h-3 w-3" />
              </span>
            )}
            {organizationFilter !== 'all' && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-surface-secondary px-3 py-1 text-xs font-medium text-text-primary cursor-pointer transition-colors hover:bg-destructive/20"
                onClick={() => {
                  setOrganizationFilter('all');
                  setCurrentPage(1);
                }}
              >
                {localize('com_settings_organization')}: {organizationFilter === 'none' ? localize('com_admin_no_organization') : organizationsData?.organizations?.find(o => o._id === organizationFilter)?.name || organizationFilter}
                <X className="h-3 w-3" />
              </span>
            )}
          </div>
        )}
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="admin-loading">
          <div className="admin-loading-spinner" />
          <p className="admin-loading-text">
            {localize('com_admin_loading_users')}
          </p>
        </div>
      )}

      {/* Error State */}
      {Boolean(error) && (
        <div className="admin-alert admin-alert-danger">
          <AlertTriangle className="h-5 w-5" />
          <div>
            <h3 className="admin-alert-title">
              {localize('com_admin_error_loading_users')}
            </h3>
            <p className="admin-alert-description">
              {localize('com_admin_error_loading_users_description')}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              className="mt-2 h-auto p-0 admin-danger hover:opacity-80"
            >
              {localize('com_admin_try_again')}
            </Button>
          </div>
        </div>
      )}

      {/* Users Table / Card View */}
      {!isLoading && !Boolean(error) && usersData && (
        <div className="admin-card overflow-hidden">
          {/* Table Header */}
          <div className="admin-card-header">
            <div className="flex items-center justify-between">
              <h3 className="admin-card-title">
                {localize('com_admin_users')} ({(usersData as any)?.totalUsers || 0} {localize('com_admin_total')})
              </h3>
              <div className="text-sm admin-text-secondary">
                {localize('com_admin_page')} {currentPage} {localize('com_admin_of')} {(usersData as any)?.totalPages || 1}
              </div>
            </div>
          </div>

          {/* Desktop Table - Hidden on mobile */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <SortableHeader field="name">
                    {localize('com_admin_user')}
                  </SortableHeader>
                  <SortableHeader field="role">
                    {localize('com_admin_role')}
                  </SortableHeader>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider admin-text-secondary">
                    {localize('com_admin_status')}
                  </th>
                  {!isOrgAdmin && (
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider admin-text-secondary">
                      {localize('com_settings_organization')}
                    </th>
                  )}
                  <SortableHeader field="createdAt">
                    {localize('com_admin_joined')}
                  </SortableHeader>
                  <SortableHeader field="lastLoginAt">
                    {localize('com_admin_last_activity')}
                  </SortableHeader>
                  <SortableHeader field="membershipExpiresAt">
                    {localize('com_admin_expires')}
                  </SortableHeader>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider admin-text-secondary">
                    {localize('com_admin_actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--admin-border-subtle)] bg-[var(--admin-bg-surface)]">
                {((usersData as any)?.users || []).map((user: any) => (
                  <tr key={user._id} className="hover:bg-[var(--admin-row-hover)]">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--admin-bg-elevated)]">
                          <User className="h-4 w-4 admin-text-secondary" />
                        </div>
                        <div className="ml-3">
                          <div className="text-sm font-medium admin-text-primary">
                            {user.name || user.username}
                          </div>
                          <div className="text-sm admin-text-secondary">
                            {user.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {/* ORG_ADMIN can't change roles - show as text */}
                      {isOrgAdmin ? (
                        <span className="rounded-md border border-[var(--admin-border-muted)] bg-[var(--admin-bg-elevated)] px-2 py-1 text-xs font-medium admin-text-primary">
                          {user.role === 'ADMIN' ? localize('com_admin_admin_role') : user.role === SystemRoles.ORG_ADMIN ? localize('com_admin_org_admin_role') : localize('com_admin_user_role')}
                        </span>
                      ) : (
                        user.role === SystemRoles.ORG_ADMIN ? (
                          <span className="admin-badge admin-badge-info">
                            {localize('com_admin_org_admin_role')}
                          </span>
                        ) : (
                          <select
                            value={user.role}
                            onChange={(e) => {
                              const newRole = e.target.value;
                              if (newRole !== user.role) {
                                setRoleChange({
                                  userId: user._id,
                                  userEmail: user.email,
                                  currentRole: user.role,
                                  newRole: newRole
                                });
                              }
                            }}
                            disabled={updateUserRoleMutation.isLoading}
                            className={`rounded-md border pl-2 pr-7 py-1 text-xs font-medium focus:outline-none focus:ring-1 cursor-pointer ${user.role === 'ADMIN'
                              ? 'border-[var(--admin-danger)] admin-danger-bg admin-danger focus:border-[var(--admin-danger)] focus:ring-[var(--admin-danger)]'
                              : 'border-[var(--admin-border-muted)] bg-[var(--admin-bg-elevated)] admin-text-primary focus:border-[var(--admin-border-active)] focus:ring-[var(--admin-border-active)]'
                              } disabled:opacity-50`}
                          >
                            <option value="USER">{localize('com_admin_user_role')}</option>
                            <option value="ADMIN">{localize('com_admin_admin_role')}</option>
                          </select>
                        )
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {/* ORG_ADMIN sees membership status, global admin sees ban status */}
                      {isOrgAdmin ? (
                        <span className={`admin-badge ${
                          !user.membershipExpiresAt
                            ? 'admin-badge-info'
                            : new Date(user.membershipExpiresAt) > new Date()
                              ? 'admin-badge-success'
                              : 'admin-badge-danger'
                        }`}>
                          {!user.membershipExpiresAt
                            ? localize('com_admin_unlimited')
                            : new Date(user.membershipExpiresAt) > new Date()
                              ? localize('com_admin_active')
                              : localize('com_admin_expired')
                          }
                        </span>
                      ) : (
                        <span className={`admin-badge ${user.isEnabled
                          ? 'admin-badge-success'
                          : 'admin-badge-danger'
                          }`}>
                          {user.isEnabled ? localize('com_admin_active') : localize('com_admin_banned')}
                        </span>
                      )}
                    </td>
                    {!isOrgAdmin && (
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {user.organizationName ? (
                            <button
                              onClick={() => navigate(`/d/admin/organizations/${user.organization}`)}
                              className="flex items-center gap-2 hover:underline admin-link transition-colors"
                            >
                              <Building2 className="h-4 w-4" />
                              <span className="text-sm">{user.organizationName}</span>
                            </button>
                          ) : (
                            <span className="text-sm admin-text-muted">-</span>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setOrganizationAssign({
                              userId: user._id,
                              userName: user.name || user.username || user.email,
                              currentOrganizationId: user.organization || null,
                              currentOrganizationName: user.organizationName || null,
                            })}
                            className="h-6 w-6 text-text-tertiary hover:text-blue-500"
                            title={localize('com_admin_assign_organization')}
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap text-sm admin-text-primary">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center text-sm admin-text-secondary">
                        <Clock className="mr-1 h-3 w-3" />
                        {user.lastActivity
                          ? new Date(user.lastActivity).toLocaleString()
                          : localize('com_admin_never')
                        }
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm admin-text-secondary">
                      {user.membershipExpiresAt ? new Date(user.membershipExpiresAt).toLocaleDateString() : localize('com_admin_unlimited')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end space-x-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setExpirationChange({
                              userId: user._id,
                              userName: user.name || user.username || user.email,
                              currentExpiresAt: user.membershipExpiresAt || null
                            });
                          }}
                          className="text-text-primary hover:text-text-primary"
                          title={localize('com_admin_set_expiration')}
                        >
                          <Clock className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => canEditUser(user) && setPasswordReset({ userId: user._id, userEmail: user.email })}
                          disabled={!canEditUser(user)}
                          className={canEditUser(user) ? 'text-text-primary hover:text-text-primary' : 'text-text-tertiary cursor-not-allowed'}
                          title={canEditUser(user) ? localize('com_admin_reset_password') : localize('com_admin_cannot_edit_admin')}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        {/* Hide ban button for ORG_ADMIN - they use expiration instead */}
                        {!isOrgAdmin && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleStatusToggle(user._id, user.isEnabled)}
                            disabled={updateUserStatusMutation.isLoading}
                            className={user.isEnabled ? 'text-destructive hover:text-destructive/80' : 'text-success hover:text-success/80'}
                            title={user.isEnabled ? localize('com_admin_ban_user') : localize('com_admin_activate_user')}
                          >
                            {updateUserStatusMutation.isLoading ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Ban className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => canDeleteUser(user) && setDeleteConfirm({ userId: user._id, userEmail: user.email })}
                          disabled={!canDeleteUser(user) || deleteUserMutation.isLoading}
                          className={canDeleteUser(user) ? 'text-destructive hover:text-destructive/80' : 'text-text-tertiary cursor-not-allowed'}
                          title={canDeleteUser(user) ? localize('com_admin_delete_user') : localize('com_admin_cannot_delete_admin')}
                        >
                          {deleteUserMutation.isLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View - Shown only on mobile */}
          <div className="lg:hidden divide-y divide-border-light">
            {((usersData as any)?.users || []).map((user: any) => (
              <div key={user._id} className="p-4 hover:bg-surface-hover transition-colors">
                {/* User Header */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="flex-shrink-0 h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold text-sm shadow-sm">
                      {(user.name || user.username || 'U').charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-text-primary truncate">
                        {user.name || user.username}
                      </div>
                      <div className="text-sm text-text-secondary truncate">
                        {user.email}
                      </div>
                    </div>
                  </div>
                  {/* Status Badge */}
                  {isOrgAdmin ? (
                    <span className={`flex-shrink-0 inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                      !user.membershipExpiresAt
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                        : new Date(user.membershipExpiresAt) > new Date()
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                          : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                    }`}>
                      {!user.membershipExpiresAt
                        ? localize('com_admin_unlimited')
                        : new Date(user.membershipExpiresAt) > new Date()
                          ? localize('com_admin_active')
                          : localize('com_admin_expired')
                      }
                    </span>
                  ) : (
                    <span className={`flex-shrink-0 inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${user.isEnabled
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                      : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                      }`}>
                      {user.isEnabled ? localize('com_admin_active') : localize('com_admin_banned')}
                    </span>
                  )}
                </div>

                {/* User Details Grid */}
                <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                  {/* Role */}
                  <div className="bg-surface-secondary/50 rounded-lg p-2.5">
                    <div className="text-xs text-text-tertiary uppercase tracking-wider mb-1">
                      {localize('com_admin_role')}
                    </div>
                    <div className="font-medium text-text-primary">
                      {user.role === 'ADMIN'
                        ? localize('com_admin_admin_role')
                        : user.role === SystemRoles.ORG_ADMIN
                          ? localize('com_admin_org_admin_role')
                          : localize('com_admin_user_role')}
                    </div>
                  </div>

                  {/* Joined Date */}
                  <div className="bg-surface-secondary/50 rounded-lg p-2.5">
                    <div className="text-xs text-text-tertiary uppercase tracking-wider mb-1">
                      {localize('com_admin_joined')}
                    </div>
                    <div className="font-medium text-text-primary">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </div>
                  </div>

                  {/* Expires / Membership */}
                  <div className="bg-surface-secondary/50 rounded-lg p-2.5">
                    <div className="text-xs text-text-tertiary uppercase tracking-wider mb-1">
                      {localize('com_admin_expires')}
                    </div>
                    <div className={`font-medium ${
                      user.membershipExpiresAt && new Date(user.membershipExpiresAt) < new Date()
                        ? 'text-red-500'
                        : 'text-text-primary'
                    }`}>
                      {user.membershipExpiresAt
                        ? new Date(user.membershipExpiresAt).toLocaleDateString()
                        : localize('com_admin_unlimited')}
                    </div>
                  </div>

                  {/* Last Activity */}
                  <div className="bg-surface-secondary/50 rounded-lg p-2.5">
                    <div className="text-xs text-text-tertiary uppercase tracking-wider mb-1">
                      {localize('com_admin_last_activity')}
                    </div>
                    <div className="font-medium text-text-primary truncate">
                      {user.lastActivity
                        ? new Date(user.lastActivity).toLocaleDateString()
                        : localize('com_admin_never')
                      }
                    </div>
                  </div>
                </div>

                {/* Organization (if global admin) */}
                {!isOrgAdmin && user.organizationName && (
                  <div className="mb-3">
                    <button
                      onClick={() => navigate(`/d/admin/organizations/${user.organization}`)}
                      className="inline-flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      <Building2 className="h-4 w-4" />
                      {user.organizationName}
                    </button>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-end gap-1 pt-2 border-t border-border-light">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setExpirationChange({
                        userId: user._id,
                        userName: user.name || user.username || user.email,
                        currentExpiresAt: user.membershipExpiresAt || null
                      });
                    }}
                    className="text-text-primary hover:text-text-primary"
                  >
                    <Clock className="h-4 w-4 mr-1" />
                    <span className="text-xs">{localize('com_admin_expires')}</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => canEditUser(user) && setPasswordReset({ userId: user._id, userEmail: user.email })}
                    disabled={!canEditUser(user)}
                    className={canEditUser(user) ? 'text-text-primary hover:text-text-primary' : 'text-text-tertiary cursor-not-allowed'}
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    <span className="text-xs">{localize('com_admin_edit')}</span>
                  </Button>
                  {!isOrgAdmin && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleStatusToggle(user._id, user.isEnabled)}
                      disabled={updateUserStatusMutation.isLoading}
                      className={user.isEnabled ? 'text-amber-600 hover:text-amber-700' : 'text-green-600 hover:text-green-700'}
                    >
                      {updateUserStatusMutation.isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Ban className="h-4 w-4 mr-1" />
                          <span className="text-xs">{user.isEnabled ? localize('com_admin_ban') : localize('com_admin_activate')}</span>
                        </>
                      )}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => canDeleteUser(user) && setDeleteConfirm({ userId: user._id, userEmail: user.email })}
                    disabled={!canDeleteUser(user) || deleteUserMutation.isLoading}
                    className={canDeleteUser(user) ? 'text-destructive hover:text-destructive/80' : 'text-text-tertiary cursor-not-allowed'}
                  >
                    {deleteUserMutation.isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Trash2 className="h-4 w-4 mr-1" />
                        <span className="text-xs">{localize('com_admin_delete')}</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          <div className="border-t border-[var(--admin-border-subtle)] bg-[var(--admin-bg-surface)] px-4 py-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              {/* Left side: Showing info & page size selector */}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                <div className="text-sm admin-text-secondary">
                  {localize('com_admin_showing')} {((currentPage - 1) * pageSize) + 1} {localize('com_admin_to')}{' '}
                  {Math.min(currentPage * pageSize, usersData?.totalUsers || 0)} {localize('com_admin_of')}{' '}
                  {usersData?.totalUsers || 0} {localize('com_admin_results')}
                </div>
                {/* Page Size Selector */}
                <div className="flex items-center gap-2">
                  <span className="text-sm admin-text-muted">{localize('com_admin_rows_per_page')}:</span>
                  <Select value={pageSize.toString()} onValueChange={handlePageSizeChange}>
                    <SelectTrigger className="w-20 h-8 admin-text-primary">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="!bg-[var(--admin-bg-surface)] !z-[100] !shadow-xl border border-[var(--admin-border-muted)]">
                      <SelectItem value="10" className="!bg-[var(--admin-bg-surface)] admin-text-primary hover:!bg-[var(--admin-row-hover)]">10</SelectItem>
                      <SelectItem value="20" className="!bg-[var(--admin-bg-surface)] admin-text-primary hover:!bg-[var(--admin-row-hover)]">20</SelectItem>
                      <SelectItem value="50" className="!bg-[var(--admin-bg-surface)] admin-text-primary hover:!bg-[var(--admin-row-hover)]">50</SelectItem>
                      <SelectItem value="100" className="!bg-[var(--admin-bg-surface)] admin-text-primary hover:!bg-[var(--admin-row-hover)]">100</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Right side: Pagination controls */}
              <div className="flex items-center justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handlePageChange(1)}
                  disabled={currentPage === 1}
                  className="h-8 w-8"
                  title={localize('com_admin_first_page')}
                >
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="h-8 w-8"
                  title={localize('com_admin_previous')}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="px-3 text-sm admin-text-primary min-w-[80px] text-center">
                  {currentPage} / {usersData?.totalPages || 1}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === (usersData?.totalPages || 1)}
                  className="h-8 w-8"
                  title={localize('com_admin_next')}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handlePageChange(usersData?.totalPages || 1)}
                  disabled={currentPage === (usersData?.totalPages || 1)}
                  className="h-8 w-8"
                  title={localize('com_admin_last_page')}
                >
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !Boolean(error) && usersData && ((usersData as any)?.users || []).length === 0 && (
        <div className="admin-card">
          <div className="admin-empty-state">
            <div className="admin-empty-state-icon">
              <Users />
            </div>
            <h3 className="admin-empty-state-title">
              {localize('com_admin_no_users_found')}
            </h3>
            <p className="admin-empty-state-description">
              {searchTerm ? localize('com_admin_no_users_match').replace('{{searchTerm}}', searchTerm) : localize('com_admin_no_users_created')}
            </p>
          </div>
        </div>
      )}

      {/* Password Reset Modal */}
      {passwordReset && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <div className="admin-modal-overlay fixed inset-0 transition-opacity" aria-hidden="true" />

            <span className="hidden sm:inline-block sm:h-screen sm:align-middle" aria-hidden="true">&#8203;</span>

            <div className="admin-modal inline-block transform overflow-hidden text-left align-bottom transition-all sm:my-8 sm:w-full sm:max-w-lg sm:align-middle">
              <div className="admin-modal-body">
                <div className="sm:flex sm:items-start">
                  <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--admin-bg-elevated)] sm:mx-0">
                    <Edit className="h-5 w-5 admin-text-primary" aria-hidden="true" />
                  </div>
                  <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                    <h3 className="admin-modal-title">
                      {localize('com_admin_reset_password_title')}
                    </h3>
                    <div className="mt-2">
                      <p className="text-sm admin-text-secondary mb-4">
                        {localize('com_admin_reset_password_description')} <strong>{passwordReset.userEmail}</strong>
                      </p>
                      <Input
                        type="password"
                        placeholder={localize('com_admin_new_password_placeholder')}
                        value={newPassword}
                        onChange={(e) => handlePasswordChange(e.target.value)}
                        className={Object.keys(passwordErrors).length > 0 ? 'border-[var(--admin-danger)] focus:border-[var(--admin-danger)] focus:ring-[var(--admin-danger)]' : 'admin-input'}
                        minLength={8}
                        maxLength={128}
                        disabled={resetPasswordMutation.isLoading}
                      />
                      {Object.keys(passwordErrors).length > 0 && (
                        <div className="mt-2 text-sm admin-danger">
                          {Object.values(passwordErrors).map((error, index) => (
                            <div key={index}>{error}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div className="admin-modal-footer sm:flex sm:flex-row-reverse">
                <button
                  disabled={resetPasswordMutation.isLoading || Object.keys(passwordErrors).length > 0 || !newPassword.trim()}
                  onClick={handlePasswordReset}
                  className="admin-btn-primary w-full sm:ml-3 sm:w-auto"
                >
                  {resetPasswordMutation.isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin inline" />
                      {localize('com_admin_resetting')}
                    </>
                  ) : (
                    localize('com_admin_reset_password_title')
                  )}
                </button>
                <button
                  disabled={resetPasswordMutation.isLoading}
                  onClick={() => {
                    setPasswordReset(null);
                    setNewPassword('');
                    setPasswordErrors({});
                  }}
                  className="admin-btn-secondary mt-3 w-full sm:mt-0 sm:w-auto"
                >
                  {localize('com_admin_cancel')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* User Creation Modal */}
      <UserCreationModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={handleUserCreated}
      />

      {/* Role Change Confirmation Modal */}
      {roleChange && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" aria-hidden="true">
              <div className="absolute inset-0 bg-black/50"></div>
            </div>

            <span className="hidden sm:inline-block sm:h-screen sm:align-middle" aria-hidden="true">&#8203;</span>

            <div className="inline-block transform overflow-hidden rounded-xl border border-border-light bg-surface-primary text-left align-bottom shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:align-middle">
              <div className="bg-surface-primary px-5 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="sm:flex sm:items-start">
                  <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-destructive/10 sm:mx-0">
                    <Shield className="h-5 w-5 text-destructive" aria-hidden="true" />
                  </div>
                  <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                    <h3 className="text-lg font-medium leading-6 text-text-primary">
                      {localize('com_admin_change_role_title')}
                    </h3>
                    <div className="mt-2">
                      <p className="text-sm text-text-secondary">
                        {localize('com_admin_change_role_confirmation')}
                        <br />
                        <strong>{roleChange.userEmail}</strong>
                        <br />
                        {localize('com_admin_role_from_to')
                          .replace('{{currentRole}}', roleChange.currentRole)
                          .replace('{{newRole}}', roleChange.newRole)}
                      </p>
                      {roleChange.newRole === 'ADMIN' && (
                        <div className="mt-3 rounded-lg bg-destructive/10 p-3">
                          <div className="flex">
                            <AlertTriangle className="h-5 w-5 text-destructive" />
                            <div className="ml-3">
                              <p className="text-sm text-destructive">
                                {localize('com_admin_admin_role_warning')}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-surface-secondary px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6">
                <Button
                  variant={roleChange.newRole === 'ADMIN' ? 'destructive' : 'submit'}
                  size="default"
                  disabled={updateUserRoleMutation.isLoading}
                  onClick={() => handleRoleChange(roleChange.userId, roleChange.currentRole, roleChange.newRole)}
                  className="w-full sm:ml-3 sm:w-auto"
                >
                  {updateUserRoleMutation.isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {localize('com_admin_updating_role')}
                    </>
                  ) : (
                    localize('com_admin_change_role')
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="default"
                  disabled={updateUserRoleMutation.isLoading}
                  onClick={() => setRoleChange(null)}
                  className="mt-3 w-full sm:mt-0 sm:w-auto"
                >
                  {localize('com_admin_cancel')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" aria-hidden="true">
              <div className="absolute inset-0 bg-black/50"></div>
            </div>

            <span className="hidden sm:inline-block sm:h-screen sm:align-middle" aria-hidden="true">&#8203;</span>

            <div className="inline-block transform overflow-hidden rounded-xl border border-border-light bg-surface-primary text-left align-bottom shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:align-middle">
              <div className="bg-surface-primary px-5 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="sm:flex sm:items-start">
                  <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-destructive/10 sm:mx-0">
                    <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
                  </div>
                  <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                    <h3 className="text-lg font-medium leading-6 text-text-primary">
                      {localize('com_admin_delete_user_title')}
                    </h3>
                    <div className="mt-2">
                      <p className="text-sm text-text-secondary">
                        {localize('com_admin_delete_user_confirmation')} <strong>{deleteConfirm.userEmail}</strong>?
                        {localize('com_admin_delete_user_warning')}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-surface-secondary px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6">
                <Button
                  variant="destructive"
                  size="default"
                  disabled={deleteUserMutation.isLoading}
                  onClick={() => handleDeleteUser(deleteConfirm.userId)}
                  className="w-full sm:ml-3 sm:w-auto"
                >
                  {deleteUserMutation.isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {localize('com_admin_deleting')}
                    </>
                  ) : (
                    localize('com_admin_delete_user_title')
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="default"
                  disabled={deleteUserMutation.isLoading}
                  onClick={() => setDeleteConfirm(null)}
                  className="mt-3 w-full sm:mt-0 sm:w-auto"
                >
                  {localize('com_admin_cancel')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Set Expiration Modal */}
      <SetExpirationModal
        isOpen={!!expirationChange}
        onClose={() => setExpirationChange(null)}
        onConfirm={handleExpirationChange}
        userName={expirationChange?.userName || ''}
        currentExpiration={expirationChange?.currentExpiresAt}
        isLoading={updateUserMutation.isLoading}
      />

      {/* Assign Organization Modal (for Admin) */}
      <AssignOrganizationModal
        isOpen={!!organizationAssign}
        onClose={() => setOrganizationAssign(null)}
        onSuccess={() => refetch()}
        userId={organizationAssign?.userId}
        userName={organizationAssign?.userName}
        currentOrganizationId={organizationAssign?.currentOrganizationId}
        currentOrganizationName={organizationAssign?.currentOrganizationName}
        isOrgAdmin={false}
      />

      {/* Add User by Email Modal (for ORG_ADMIN) */}
      <AssignOrganizationModal
        isOpen={showAddUserByEmail}
        onClose={() => setShowAddUserByEmail(false)}
        onSuccess={() => refetch()}
        isOrgAdmin={true}
      />
    </div>
  );
}