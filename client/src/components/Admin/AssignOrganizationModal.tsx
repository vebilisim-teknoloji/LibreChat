import { useState, useEffect } from 'react';
import { X, Building2, Loader2, AlertTriangle, UserPlus, Mail, Search } from 'lucide-react';
import { useLocalize } from '~/hooks';
import { useToastContext } from '@librechat/client';
import { useGetOrganizationsQuery } from '~/data-provider/Admin/organizations';
import {
  useAddUserToOrganizationMutation,
  useAddUserToOrganizationByEmailMutation,
  useRemoveUserFromOrganizationMutation,
} from '~/data-provider';

interface AssignOrganizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  // For Admin: assign by selecting user
  userId?: string;
  userName?: string;
  currentOrganizationId?: string | null;
  currentOrganizationName?: string | null;
  // For ORG_ADMIN: only add by email
  isOrgAdmin?: boolean;
}

export default function AssignOrganizationModal({
  isOpen,
  onClose,
  onSuccess,
  userId,
  userName,
  currentOrganizationId,
  currentOrganizationName,
  isOrgAdmin = false,
}: AssignOrganizationModalProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string>('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch organizations (only for Admin)
  const { data: organizationsData, isLoading: isLoadingOrgs } = useGetOrganizationsQuery(
    { page: 1, limit: 100 },
    { enabled: isOpen && !isOrgAdmin }
  );

  // Mutations
  const addUserToOrgMutation = useAddUserToOrganizationMutation();
  const addUserByEmailMutation = useAddUserToOrganizationByEmailMutation();
  const removeUserFromOrgMutation = useRemoveUserFromOrganizationMutation();

  const isLoading = addUserToOrgMutation.isLoading || addUserByEmailMutation.isLoading || removeUserFromOrgMutation.isLoading;

  useEffect(() => {
    if (isOpen) {
      setError('');
      setEmail('');
      setSearchTerm('');
      setSelectedOrganizationId(currentOrganizationId || '');
    }
  }, [isOpen, currentOrganizationId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      if (isOrgAdmin) {
        // ORG_ADMIN: Add by email
        if (!email.trim()) {
          setError(localize('com_admin_email_required'));
          return;
        }

        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email.trim())) {
          setError(localize('com_admin_invalid_email'));
          return;
        }

        await addUserByEmailMutation.mutateAsync({ email: email.trim() });

        // Show success toast with user info
        showToast({
          message: localize('com_admin_user_added_to_org_success', { email: email.trim() }),
          status: 'success',
        });
      } else {
        // Admin: Add by userId + organizationId
        if (!userId) {
          setError(localize('com_admin_user_required'));
          return;
        }

        if (selectedOrganizationId === '') {
          // Remove from organization
          if (!currentOrganizationId) {
            setError(localize('com_admin_user_not_in_org'));
            return;
          }
          await removeUserFromOrgMutation.mutateAsync({ userId });

          // Show success toast for removal
          showToast({
            message: localize('com_admin_user_removed_from_org_success', { name: userName || '' }),
            status: 'success',
          });
        } else {
          // Add to organization
          await addUserToOrgMutation.mutateAsync({
            userId,
            organizationId: selectedOrganizationId,
          });

          // Get selected organization name for toast
          const selectedOrg = filteredOrganizations.find(org => org._id === selectedOrganizationId);
          showToast({
            message: localize('com_admin_user_assigned_to_org_success', {
              name: userName || '',
              organization: selectedOrg?.name || ''
            }),
            status: 'success',
          });
        }
      }

      onSuccess?.();
      onClose();
    } catch (err: any) {
      const apiMessage = err?.response?.data?.message || err?.message || '';

      // Map API error messages to localization keys
      const errorMessageMap: Record<string, string> = {
        'User with this email not found': 'com_admin_error_user_not_found_email',
        'User is already a member of your organization': 'com_admin_error_user_already_in_your_org',
        'User is already a member of another organization': 'com_admin_error_user_in_another_org',
        'Cannot add system administrators to organization': 'com_admin_error_cannot_add_admin',
        'Organization not found': 'com_admin_error_org_not_found',
        'Error adding user to organization': 'com_admin_error_adding_user',
      };

      const localizedKey = errorMessageMap[apiMessage];
      const message = localizedKey ? localize(localizedKey as any) : (apiMessage || localize('com_admin_operation_failed'));

      setError(message);

      // Show error toast
      showToast({
        message: message,
        status: 'error',
      });
    }
  };

  // Filter organizations based on search
  const filteredOrganizations = organizationsData?.organizations?.filter(org =>
    org.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    org.code?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" onClick={onClose}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm"></div>
        </div>

        <span className="hidden sm:inline-block sm:h-screen sm:align-middle">&#8203;</span>

        <div
          className="inline-block transform overflow-hidden rounded-xl bg-surface-primary text-left align-bottom shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-md sm:align-middle border border-border-medium"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border-medium">
            <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
              {isOrgAdmin ? (
                <>
                  <UserPlus className="h-5 w-5 text-green-500" />
                  {localize('com_admin_add_user_to_organization')}
                </>
              ) : (
                <>
                  <Building2 className="h-5 w-5 text-blue-500" />
                  {localize('com_admin_assign_organization')}
                </>
              )}
            </h3>
            <button
              onClick={onClose}
              className="p-1 rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-4">
            {!isOrgAdmin && userName && (
              <p className="text-sm text-text-secondary mb-4">
                {localize('com_admin_assign_organization_for')}{' '}
                <span className="font-medium text-text-primary">{userName}</span>
                {currentOrganizationName && (
                  <span className="block mt-1 text-xs">
                    {localize('com_admin_current_organization')}:{' '}
                    <span className="font-medium text-blue-600 dark:text-blue-400">{currentOrganizationName}</span>
                  </span>
                )}
              </p>
            )}

            {isOrgAdmin && (
              <p className="text-sm text-text-secondary mb-4">
                {localize('com_admin_add_user_by_email_description')}
              </p>
            )}

            {error && (
              <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-600 dark:text-red-400 flex items-center gap-2 border border-red-200 dark:border-red-800">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              {isOrgAdmin ? (
                // ORG_ADMIN: Email input only
                <div className="mb-4">
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    {localize('com_admin_user_email')}
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={localize('com_admin_enter_user_email')}
                      className="block w-full rounded-lg border border-border-medium bg-surface-secondary pl-10 pr-3 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:border-border-heavy focus:ring-1 focus:ring-border-heavy"
                      autoFocus
                    />
                  </div>
                  <p className="text-xs text-text-tertiary mt-2">
                    {localize('com_admin_email_must_exist')}
                  </p>
                </div>
              ) : (
                // Admin: Organization selection
                <div className="mb-4">
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    {localize('com_settings_organization')}
                  </label>

                  {isLoadingOrgs ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-text-tertiary" />
                    </div>
                  ) : (
                    <>
                      {/* Search input */}
                      {(organizationsData?.organizations?.length || 0) > 5 && (
                        <div className="relative mb-3">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
                          <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder={localize('com_admin_search_organizations')}
                            className="block w-full rounded-lg border border-border-medium bg-surface-secondary pl-10 pr-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-border-heavy focus:ring-1 focus:ring-border-heavy"
                          />
                        </div>
                      )}

                      {/* Organization list */}
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {/* No organization option */}
                        <label className="flex items-center gap-3 p-3 rounded-lg border border-border-medium cursor-pointer hover:bg-surface-hover transition-colors">
                          <input
                            type="radio"
                            name="organization"
                            value=""
                            checked={selectedOrganizationId === ''}
                            onChange={() => setSelectedOrganizationId('')}
                            className="h-4 w-4 text-blue-600"
                          />
                          <div className="flex items-center gap-2">
                            <X className="h-4 w-4 text-gray-400" />
                            <span className="font-medium text-text-secondary italic">
                              {localize('com_admin_no_organization')}
                            </span>
                          </div>
                        </label>

                        {filteredOrganizations.map((org) => (
                          <label
                            key={org._id}
                            className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-surface-hover transition-colors ${
                              selectedOrganizationId === org._id
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                : 'border-border-medium'
                            }`}
                          >
                            <input
                              type="radio"
                              name="organization"
                              value={org._id}
                              checked={selectedOrganizationId === org._id}
                              onChange={() => setSelectedOrganizationId(org._id)}
                              className="h-4 w-4 text-blue-600"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <Building2 className="h-4 w-4 text-blue-500 flex-shrink-0" />
                                <span className="font-medium text-text-primary truncate">{org.name}</span>
                              </div>
                              {org.code && (
                                <p className="text-xs text-text-tertiary mt-0.5 ml-6">
                                  {org.code}
                                </p>
                              )}
                            </div>
                          </label>
                        ))}

                        {filteredOrganizations.length === 0 && searchTerm && (
                          <p className="text-center text-sm text-text-tertiary py-4">
                            {localize('com_admin_no_organizations_found')}
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Footer */}
              <div className="flex justify-end gap-3 pt-4 border-t border-border-medium mt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-border-medium bg-surface-primary px-4 py-2 text-sm font-medium text-text-primary hover:bg-surface-hover transition-colors"
                >
                  {localize('com_admin_cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="animate-spin h-4 w-4" />
                      {localize('com_admin_saving')}
                    </>
                  ) : isOrgAdmin ? (
                    <>
                      <UserPlus className="h-4 w-4" />
                      {localize('com_admin_add_user')}
                    </>
                  ) : selectedOrganizationId === '' && currentOrganizationId ? (
                    <>
                      <X className="h-4 w-4" />
                      {localize('com_admin_remove_from_organization')}
                    </>
                  ) : (
                    <>
                      <Building2 className="h-4 w-4" />
                      {localize('com_admin_assign')}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
