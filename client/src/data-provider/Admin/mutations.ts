import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';
import { QueryKeys } from 'librechat-data-provider';
import { request } from 'librechat-data-provider';
import type {
  TAdminUser,
  TEndpointSetting,
  TEndpointSettingsResponse,
  TAdminApiKeyResponse,
  TAdminApiKeysResponse,
  TEndpointModelsResponse,
  TAdminModelSettings,
  TAdminModelControlStats,
  TModelWithAdminStatus,
  TToolSetting,
  TToolSettingsResponse,
} from './queries';

// Mutation Types
export interface TCreateUserRequest {
  username: string;
  email: string;
  password: string;
  name: string;
  role?: string;
  isEnabled?: boolean;
}

export interface TUpdateUserRoleRequest {
  userId: string;
  role: string;
}

export interface TBanUserRequest {
  userId: string;
  isEnabled: boolean;
  reason?: string;
}

export interface TUpdateUserStatusRequest {
  userId: string;
  banned: boolean;
}

export interface TResetUserPasswordRequest {
  userId: string;
  password: string;
}

export interface TDeleteUserRequest {
  userId: string;
  reason?: string;
}

export interface TCreateUserResponse {
  user: TAdminUser;
  message: string;
}

export interface TMutationResponse {
  success: boolean;
  message: string;
  user?: TAdminUser;
}

// Mutation: Create New User
export const useCreateUserMutation = (): UseMutationResult<
  TCreateUserResponse,
  unknown,
  TCreateUserRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation(
    (payload: TCreateUserRequest) => request.post('/api/admin/users', payload),
    {
      onSuccess: () => {
        // Invalidate users list to refetch with new user
        queryClient.invalidateQueries([QueryKeys.user, 'admin', 'users']);
        queryClient.invalidateQueries([QueryKeys.user, 'admin', 'stats']);
      },
    },
  );
};

// Mutation: Update User Role
export const useUpdateUserRoleMutation = (): UseMutationResult<
  TMutationResponse,
  unknown,
  TUpdateUserRoleRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation(
    (payload: TUpdateUserRoleRequest) =>
      request.put(`/api/admin/users/${payload.userId}/role`, { role: payload.role }),
    {
      onSuccess: (_, variables) => {
        // Invalidate specific user and users list
        queryClient.invalidateQueries([QueryKeys.user, 'admin', 'user', variables.userId]);
        queryClient.invalidateQueries([QueryKeys.user, 'admin', 'users']);
        queryClient.invalidateQueries([QueryKeys.user, 'admin', 'stats']);
      },
    },
  );
};

// Mutation: Generic Update User (Name, Expiration, etc.)
export interface TUpdateUserRequest {
  userId: string;
  name?: string;
  membershipExpiresAt?: string | null;
}

export const useUpdateUserMutation = (): UseMutationResult<
  TMutationResponse,
  unknown,
  TUpdateUserRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation(
    (payload: TUpdateUserRequest) =>
      request.put(`/api/admin/users/${payload.userId}`, payload),
    {
      onSuccess: (_, variables) => {
        queryClient.invalidateQueries([QueryKeys.user, 'admin', 'user', variables.userId]);
        queryClient.invalidateQueries([QueryKeys.user, 'admin', 'users']);
        queryClient.invalidateQueries([QueryKeys.user, 'admin', 'stats']);
      },
    },
  );
};


// Mutation: Update User Status (Ban/Activate Toggle)
export const useUpdateUserStatusMutation = (): UseMutationResult<
  TMutationResponse,
  unknown,
  TUpdateUserStatusRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation(
    (payload: TUpdateUserStatusRequest) =>
      request.put(`/api/admin/users/${payload.userId}/status`, {
        banned: payload.banned,
      }),
    {
      // Optimistic update for immediate UI feedback
      onMutate: async (newUserStatus) => {
        // Cancel ongoing queries to prevent overwriting optimistic update
        await queryClient.cancelQueries([QueryKeys.user, 'admin', 'users']);

        // Get all queries that match the pattern and update them
        const queryKeys = queryClient.getQueryCache().findAll([QueryKeys.user, 'admin', 'users']);
        let previousData: any[] = [];

        // Update all matching queries optimistically
        queryKeys.forEach((queryState) => {
          const currentData = queryClient.getQueryData(queryState.queryKey);
          if (currentData) {
            previousData.push({ key: queryState.queryKey, data: currentData });

            // Optimistically update this specific query
            queryClient.setQueryData(queryState.queryKey, (old: any) => {
              if (!old || !old.users) return old;

              const newUsersData = {
                ...old,
                users: old.users.map((user: any) => {
                  if (user._id === newUserStatus.userId) {
                    return {
                      ...user,
                      banned: newUserStatus.banned,
                      isEnabled: !newUserStatus.banned
                    };
                  }
                  return user;
                })
              };

              return newUsersData;
            });
          }
        });

        // Return previous data for rollback if needed
        return { previousData };
      },

      onError: (err, newUserStatus, context) => {
        // Rollback on error
        if (context?.previousData) {
          context.previousData.forEach(({ key, data }) => {
            queryClient.setQueryData(key, data);
          });
        }
      },

      onSettled: () => {
        // Always refetch after mutation completes
        queryClient.invalidateQueries([QueryKeys.user, 'admin', 'users']);
        queryClient.invalidateQueries([QueryKeys.user, 'admin', 'stats']);
      },
    },
  );
};

// Mutation: Reset User Password
export const useResetUserPasswordMutation = (): UseMutationResult<
  TMutationResponse,
  unknown,
  TResetUserPasswordRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation(
    (payload: TResetUserPasswordRequest) =>
      request.put(`/api/admin/users/${payload.userId}/password`, {
        password: payload.password,
      }),
    {
      onSuccess: (_, variables) => {
        // Invalidate user queries
        queryClient.invalidateQueries([QueryKeys.user, 'admin', 'user', variables.userId]);
        queryClient.invalidateQueries([QueryKeys.user, 'admin', 'users']);
      },
    },
  );
};

// Mutation: Ban/Unban User
export const useBanUserMutation = (): UseMutationResult<
  TMutationResponse,
  unknown,
  TBanUserRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation(
    (payload: TBanUserRequest) =>
      request.put(`/api/admin/users/${payload.userId}/ban`, {
        isEnabled: payload.isEnabled,
        reason: payload.reason,
      }),
    {
      onSuccess: (_, variables) => {
        // Invalidate specific user and users list
        queryClient.invalidateQueries([QueryKeys.user, 'admin', 'user', variables.userId]);
        queryClient.invalidateQueries([QueryKeys.user, 'admin', 'users']);
        queryClient.invalidateQueries([QueryKeys.user, 'admin', 'stats']);
      },
    },
  );
};

// Mutation: Delete User
export const useAdminDeleteUserMutation = (): UseMutationResult<
  TMutationResponse,
  unknown,
  TDeleteUserRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation(
    (payload: TDeleteUserRequest) =>
      request.delete(`/api/admin/users/${payload.userId}`, {
        data: { reason: payload.reason },
      }),
    {
      onSuccess: (_, variables) => {
        // Remove user from cache and invalidate lists
        queryClient.removeQueries([QueryKeys.user, 'admin', 'user', variables.userId]);
        queryClient.invalidateQueries([QueryKeys.user, 'admin', 'users']);
        queryClient.invalidateQueries([QueryKeys.user, 'admin', 'stats']);
      },
    },
  );
};

// Mutation: Bulk User Operations
export interface TBulkUserOperationRequest {
  userIds: string[];
  operation: 'ban' | 'unban' | 'delete' | 'role_update';
  data?: {
    role?: string;
    reason?: string;
    isEnabled?: boolean;
  };
}

// Endpoint Management Request Types

export interface TToggleEndpointRequest {
  endpoint: string;
  enabled: boolean;
}

export interface TUpdateEndpointSettingRequest {
  endpoint: string;
  enabled?: boolean;
  allowedRoles?: string[];
  order?: number;
  description?: string;
  metadata?: Record<string, any>;
}

export interface TReorderEndpointsRequest {
  updates: Array<{
    endpoint: string;
    order: number;
  }>;
}

export interface TBulkUpdateEndpointsRequest {
  updates: Array<{
    endpoint: string;
    enabled?: boolean;
    allowedRoles?: string[];
    order?: number;
    description?: string;
    metadata?: Record<string, any>;
  }>;
}

export interface TEndpointMutationResponse {
  setting?: TEndpointSetting;
  message: string;
  success?: boolean;
}

export const useBulkUserOperationMutation = (): UseMutationResult<
  TMutationResponse,
  unknown,
  TBulkUserOperationRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation(
    (payload: TBulkUserOperationRequest) =>
      request.post('/api/admin/users/bulk', payload),
    {
      onSuccess: () => {
        // Invalidate all admin-related queries for bulk operations
        queryClient.invalidateQueries([QueryKeys.user, 'admin']);
      },
    },
  );
};

// Endpoint Management Mutations

// Mutation: Toggle Endpoint Status
export const useToggleEndpointMutation = (): UseMutationResult<
  TEndpointMutationResponse,
  unknown,
  TToggleEndpointRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation(
    (payload: TToggleEndpointRequest) =>
      request.post(`/api/admin/endpoints/${payload.endpoint}/toggle`, {
        enabled: payload.enabled,
      }),
    {
      // Optimistic update for immediate feedback
      onMutate: async (newEndpointData) => {
        await queryClient.cancelQueries(['admin', 'endpoints']);

        const previousData = queryClient.getQueryData(['admin', 'endpoints']);

        // Optimistically update endpoint in cache
        queryClient.setQueryData(['admin', 'endpoints'], (old: any) => {
          if (!old || !old.settings) return old;

          return {
            ...old,
            settings: old.settings.map((setting: TEndpointSetting) => {
              if (setting.endpoint === newEndpointData.endpoint) {
                return { ...setting, enabled: newEndpointData.enabled };
              }
              return setting;
            }),
            stats: {
              ...old.stats,
              enabled: old.settings.filter((s: TEndpointSetting) =>
                s.endpoint === newEndpointData.endpoint ? newEndpointData.enabled : s.enabled
              ).length,
              disabled: old.settings.filter((s: TEndpointSetting) =>
                s.endpoint === newEndpointData.endpoint ? !newEndpointData.enabled : !s.enabled
              ).length,
            }
          };
        });

        return { previousData };
      },

      onError: (err, newData, context) => {
        if (context?.previousData) {
          queryClient.setQueryData(['admin', 'endpoints'], context.previousData);
        }
      },

      onSettled: () => {
        queryClient.invalidateQueries(['admin', 'endpoints']);
        // Invalidate endpoint config to update ModelSelector
        queryClient.invalidateQueries([QueryKeys.endpoints]);
        // Force refetch startupConfig as well
        queryClient.invalidateQueries([QueryKeys.startupConfig]);
        // Clear all endpoint-related cache
        queryClient.removeQueries([QueryKeys.endpoints]);
        queryClient.refetchQueries([QueryKeys.endpoints]);
      },
    },
  );
};

// Mutation: Update Endpoint Setting
export const useUpdateEndpointSettingMutation = (): UseMutationResult<
  TEndpointMutationResponse,
  unknown,
  TUpdateEndpointSettingRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation(
    (payload: TUpdateEndpointSettingRequest) => {
      const { endpoint, ...data } = payload;
      return request.put(`/api/admin/endpoints/${endpoint}`, data);
    },
    {
      onSuccess: (_, variables) => {
        queryClient.invalidateQueries(['admin', 'endpoints']);
        queryClient.invalidateQueries([QueryKeys.endpoints]);
      },
    },
  );
};

// Mutation: Reorder Endpoints
export const useReorderEndpointsMutation = (): UseMutationResult<
  { updatedCount: number; message: string },
  unknown,
  TReorderEndpointsRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation(
    (payload: TReorderEndpointsRequest) =>
      request.post('/api/admin/endpoints/reorder', payload),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['admin', 'endpoints']);
        queryClient.invalidateQueries([QueryKeys.endpoints]);
      },
    },
  );
};

// Mutation: Bulk Update Endpoints
export const useBulkUpdateEndpointsMutation = (): UseMutationResult<
  {
    results: Array<{ endpoint: string; status: string; setting?: TEndpointSetting }>;
    errors: Array<{ endpoint: string; error: string }>;
    successCount: number;
    errorCount: number;
    message: string;
  },
  unknown,
  TBulkUpdateEndpointsRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation(
    (payload: TBulkUpdateEndpointsRequest) =>
      request.post('/api/admin/endpoints/bulk', payload),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['admin', 'endpoints']);
        queryClient.invalidateQueries([QueryKeys.endpoints]);
      },
    },
  );
};

// Mutation: Initialize Default Endpoints
export const useInitializeEndpointsMutation = (): UseMutationResult<
  { initializedCount: number; message: string },
  unknown,
  { defaultEndpoints: string[] },
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation(
    (payload: { defaultEndpoints: string[] }) =>
      request.post('/api/admin/endpoints/initialize', payload),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['admin', 'endpoints']);
        queryClient.invalidateQueries([QueryKeys.endpoints]);
      },
    },
  );
};

// Mutation: Clear Endpoint Cache
export const useClearEndpointCacheMutation = (): UseMutationResult<
  { cleared: boolean; message: string },
  unknown,
  void,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation(
    () => request.post('/api/admin/endpoints/cache/clear'),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['admin', 'endpoints']);
        queryClient.invalidateQueries([QueryKeys.endpoints]);
      },
    },
  );
};

// Admin API Keys Mutation Types

export interface TSetAdminApiKeyRequest {
  endpoint: string;
  apiKey: string;
  baseURL?: string;
  description?: string;
  isActive?: boolean;
}

export interface TUpdateAdminApiKeySettingsRequest {
  endpoint: string;
  baseURL?: string;
  description?: string;
  isActive?: boolean;
}

export interface TToggleAdminApiKeyRequest {
  endpoint: string;
  isActive: boolean;
}

export interface TAdminApiKeyMutationResponse {
  key?: TAdminApiKeyResponse;
  message: string;
  success?: boolean;
}

// Admin Model Control Mutation Types

export interface TToggleModelRequest {
  endpoint: string;
  modelName: string;
  isEnabled: boolean;
  reason?: string;
  position?: number;
  isDefault?: boolean;
}

export interface TBulkUpdateModelsRequest {
  endpoint: string;
  updates: Array<{
    modelName: string;
    isEnabled: boolean;
    reason?: string;
    position?: number;
    isDefault?: boolean;
  }>;
}

export interface TResetModelSettingRequest {
  endpoint: string;
  modelName: string;
}

export interface TModelMutationResponse {
  success: boolean;
  setting?: TAdminModelSettings;
  message: string;
}

export interface TBulkModelUpdateResponse {
  success: boolean;
  result: {
    endpoint: string;
    totalUpdates: number;
    successful: number;
    failed: number;
    errors: Array<{
      modelName: string;
      error: string;
    }>;
  };
}

// Admin API Keys Mutations

// Mutation: Set/Create Admin API Key
export const useSetAdminApiKeyMutation = (): UseMutationResult<
  TAdminApiKeyMutationResponse,
  unknown,
  TSetAdminApiKeyRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation(
    (payload: TSetAdminApiKeyRequest) => {
      const { endpoint, ...data } = payload;
      return request.post(`/api/admin/api-keys/${endpoint}`, data);
    },
    {
      onSuccess: (_, variables) => {
        // Invalidate all admin API key queries
        queryClient.invalidateQueries(['admin', 'api-keys']);
        queryClient.invalidateQueries(['admin', 'api-keys', variables.endpoint]);
        queryClient.invalidateQueries(['admin', 'api-keys', variables.endpoint, 'exists']);
        queryClient.invalidateQueries(['admin', 'api-keys', 'stats']);

        // Invalidate endpoint config to update userProvide setting
        queryClient.invalidateQueries([QueryKeys.endpoints]);
        queryClient.invalidateQueries([QueryKeys.startupConfig]);

        // Clear endpoint config cache to force refresh
        queryClient.removeQueries([QueryKeys.endpoints]);
        queryClient.refetchQueries([QueryKeys.endpoints]);
      },
    },
  );
};

// Mutation: Update Admin API Key Settings (without changing the key)
export const useUpdateAdminApiKeySettingsMutation = (): UseMutationResult<
  TAdminApiKeyMutationResponse,
  unknown,
  TUpdateAdminApiKeySettingsRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation(
    (payload: TUpdateAdminApiKeySettingsRequest) => {
      const { endpoint, ...data } = payload;
      return request.put(`/api/admin/api-keys/${endpoint}`, data);
    },
    {
      onSuccess: (_, variables) => {
        queryClient.invalidateQueries(['admin', 'api-keys']);
        queryClient.invalidateQueries(['admin', 'api-keys', variables.endpoint]);
        queryClient.invalidateQueries(['admin', 'api-keys', 'stats']);

        // Invalidate endpoint config if isActive changed
        queryClient.invalidateQueries([QueryKeys.endpoints]);
      },
    },
  );
};

// Mutation: Toggle Admin API Key Status
export const useToggleAdminApiKeyMutation = (): UseMutationResult<
  TAdminApiKeyMutationResponse,
  unknown,
  TToggleAdminApiKeyRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation(
    (payload: TToggleAdminApiKeyRequest) =>
      request.patch(`/api/admin/api-keys/${payload.endpoint}/toggle`, {
        isActive: payload.isActive,
      }),
    {
      // Optimistic update for immediate feedback
      onMutate: async (newData) => {
        await queryClient.cancelQueries(['admin', 'api-keys']);

        const previousData = queryClient.getQueryData(['admin', 'api-keys']);

        // Optimistically update API key in cache
        queryClient.setQueryData(['admin', 'api-keys'], (old: any) => {
          if (!old || !old.keys) return old;

          return {
            ...old,
            keys: old.keys.map((key: TAdminApiKeyResponse) => {
              if (key.endpoint === newData.endpoint) {
                return { ...key, isActive: newData.isActive };
              }
              return key;
            }),
            stats: {
              ...old.stats,
              active: old.keys.filter((k: TAdminApiKeyResponse) =>
                k.endpoint === newData.endpoint ? newData.isActive : k.isActive
              ).length,
              inactive: old.keys.filter((k: TAdminApiKeyResponse) =>
                k.endpoint === newData.endpoint ? !newData.isActive : !k.isActive
              ).length,
            }
          };
        });

        return { previousData };
      },

      onError: (err, newData, context) => {
        if (context?.previousData) {
          queryClient.setQueryData(['admin', 'api-keys'], context.previousData);
        }
      },

      onSettled: (_, __, variables) => {
        queryClient.invalidateQueries(['admin', 'api-keys']);
        queryClient.invalidateQueries(['admin', 'api-keys', variables.endpoint]);
        queryClient.invalidateQueries(['admin', 'api-keys', variables.endpoint, 'exists']);

        // Invalidate endpoint config to update userProvide setting
        queryClient.invalidateQueries([QueryKeys.endpoints]);
        queryClient.invalidateQueries([QueryKeys.startupConfig]);

        // Clear endpoint config cache to force refresh
        queryClient.removeQueries([QueryKeys.endpoints]);
        queryClient.refetchQueries([QueryKeys.endpoints]);
      },
    },
  );
};

// Mutation: Delete Admin API Key
export const useDeleteAdminApiKeyMutation = (): UseMutationResult<
  { message: string },
  unknown,
  { endpoint: string },
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation(
    (payload: { endpoint: string }) =>
      request.delete(`/api/admin/api-keys/${payload.endpoint}`),
    {
      onSuccess: (_, variables) => {
        // Remove specific key from cache
        queryClient.removeQueries(['admin', 'api-keys', variables.endpoint]);
        queryClient.removeQueries(['admin', 'api-keys', variables.endpoint, 'exists']);

        // Invalidate list and stats
        queryClient.invalidateQueries(['admin', 'api-keys']);
        queryClient.invalidateQueries(['admin', 'api-keys', 'stats']);

        // Invalidate endpoint config to update userProvide setting
        queryClient.invalidateQueries([QueryKeys.endpoints]);
        queryClient.invalidateQueries([QueryKeys.startupConfig]);

        // Clear endpoint config cache to force refresh
        queryClient.removeQueries([QueryKeys.endpoints]);
        queryClient.refetchQueries([QueryKeys.endpoints]);
      },
    },
  );
};

// Mutation: Clear Admin API Keys Cache
export const useClearAdminApiKeysCacheMutation = (): UseMutationResult<
  { message: string },
  unknown,
  void,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation(
    () => request.post('/api/admin/api-keys/cache/clear'),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['admin', 'api-keys']);
        queryClient.invalidateQueries([QueryKeys.endpoints]);
        queryClient.invalidateQueries([QueryKeys.startupConfig]);
      },
    },
  );
};

// Admin Model Control Mutations

// Mutation: Toggle Model Visibility
export const useToggleModelMutation = (): UseMutationResult<
  TModelMutationResponse,
  unknown,
  TToggleModelRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation(
    (payload: TToggleModelRequest) => {
      const { endpoint, modelName, ...data } = payload;
      return request.put(`/api/admin/models/${endpoint}/${encodeURIComponent(modelName)}`, data);
    },
    {
      // Optimistic update for immediate feedback
      onMutate: async (newData) => {
        await queryClient.cancelQueries(['admin', 'models', newData.endpoint]);

        const previousData = queryClient.getQueryData(['admin', 'models', newData.endpoint]);

        // Optimistically update model in cache
        queryClient.setQueryData(['admin', 'models', newData.endpoint], (old: any) => {
          if (!old || !old.models) return old;

          return {
            ...old,
            models: old.models.map((model: TModelWithAdminStatus) => {
              if (model.modelName === newData.modelName) {
                return {
                  ...model,
                  isEnabled: newData.isEnabled,
                  reason: newData.reason,
                  disabledAt: newData.isEnabled ? undefined : new Date().toISOString()
                };
              }
              return model;
            }),
          };
        });

        return { previousData };
      },

      onError: (err, newData, context) => {
        if (context?.previousData) {
          queryClient.setQueryData(['admin', 'models', newData.endpoint], context.previousData);
        }
      },

      onSettled: (_, __, variables) => {
        // Invalidate endpoint models query
        queryClient.invalidateQueries(['admin', 'models', variables.endpoint]);
        // Invalidate stats
        queryClient.invalidateQueries(['admin', 'models', 'stats']);
        // Invalidate all model settings
        queryClient.invalidateQueries(['admin', 'models', 'all']);

        // Invalidate model config to force refresh for users
        queryClient.invalidateQueries([QueryKeys.models]);

        // Clear model config cache to force refresh
        queryClient.removeQueries([QueryKeys.models]);
        queryClient.refetchQueries([QueryKeys.models]);
      },
    },
  );
};

// Mutation: Bulk Update Models
export const useBulkUpdateModelsMutation = (): UseMutationResult<
  TBulkModelUpdateResponse,
  unknown,
  TBulkUpdateModelsRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation(
    (payload: TBulkUpdateModelsRequest) => {
      const { endpoint, updates } = payload;
      return request.post(`/api/admin/models/${endpoint}/bulk`, { updates });
    },
    {
      onSuccess: (_, variables) => {
        // Invalidate endpoint models query
        queryClient.invalidateQueries(['admin', 'models', variables.endpoint]);
        // Invalidate stats
        queryClient.invalidateQueries(['admin', 'models', 'stats']);
        // Invalidate all model settings
        queryClient.invalidateQueries(['admin', 'models', 'all']);

        // Invalidate model config to force refresh for users
        queryClient.invalidateQueries([QueryKeys.models]);

        // Clear model config cache to force refresh
        queryClient.removeQueries([QueryKeys.models]);
        queryClient.refetchQueries([QueryKeys.models]);
      },
    },
  );
};

// Mutation: Reset Model Setting
export const useResetModelSettingMutation = (): UseMutationResult<
  { success: boolean; message: string },
  unknown,
  TResetModelSettingRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation(
    (payload: TResetModelSettingRequest) => {
      const { endpoint, modelName } = payload;
      return request.delete(`/api/admin/models/${endpoint}/${encodeURIComponent(modelName)}`);
    },
    {
      onSuccess: (_, variables) => {
        // Invalidate endpoint models query
        queryClient.invalidateQueries(['admin', 'models', variables.endpoint]);
        // Invalidate stats
        queryClient.invalidateQueries(['admin', 'models', 'stats']);
        // Invalidate all model settings
        queryClient.invalidateQueries(['admin', 'models', 'all']);

        // Invalidate model config to force refresh for users
        queryClient.invalidateQueries([QueryKeys.models]);

        // Clear model config cache to force refresh
        queryClient.removeQueries([QueryKeys.models]);
        queryClient.refetchQueries([QueryKeys.models]);
      },
    },
  );
};

// Mutation: Clear Model Settings Cache
export const useClearModelCacheMutation = (): UseMutationResult<
  { success: boolean; message: string },
  unknown,
  { endpoint?: string },
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation(
    (payload: { endpoint?: string }) => {
      const params = payload.endpoint ? `?endpoint=${payload.endpoint}` : '';
      return request.delete(`/api/admin/models/cache${params}`);
    },
    {
      onSuccess: () => {
        // Invalidate all model-related queries
        queryClient.invalidateQueries(['admin', 'models']);
        queryClient.invalidateQueries([QueryKeys.models]);

        // Clear model config cache to force refresh
        queryClient.removeQueries([QueryKeys.models]);
        queryClient.refetchQueries([QueryKeys.models]);
      },
    },
  );
};

// Provider Ordering Types
export interface TUpdateProviderOrderRequest {
  endpoint: string;
  providerDisplayOrder: string[];
}

export interface TUpdateProviderOrderResponse {
  success: boolean;
  message: string;
  settings: {
    _id: string;
    endpoint: string;
    providerDisplayOrder: string[];
    updatedBy?: string;
    createdAt: string;
    updatedAt: string;
  };
}

// Mutation: Update Provider Display Order
export const useUpdateProviderOrderMutation = (): UseMutationResult<
  TUpdateProviderOrderResponse,
  unknown,
  TUpdateProviderOrderRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation(
    (payload: TUpdateProviderOrderRequest) =>
      request.put(`/api/admin/models/provider-order/${payload.endpoint}`, {
        providerDisplayOrder: payload.providerDisplayOrder,
      }),
    {
      onSuccess: (_, variables) => {
        // Invalidate provider order query for this endpoint
        queryClient.invalidateQueries([QueryKeys.providerOrder, variables.endpoint]);

        // Invalidate models query to refresh UI with new order
        queryClient.invalidateQueries([QueryKeys.models]);
      },
    },
  );
};

// Model Order Mutation Types
export type TUpdateModelOrderRequest = {
  endpoint: string;
  provider: string;
  modelDisplayOrder: string[];
};

export type TUpdateModelOrderResponse = {
  success: boolean;
  message: string;
  settings: {
    endpoint: string;
    provider: string;
    modelDisplayOrder: string[];
    updatedBy?: string;
    createdAt: string;
    updatedAt: string;
  };
};

// Mutation: Update Model Display Order
export const useUpdateModelOrderMutation = (): UseMutationResult<
  TUpdateModelOrderResponse,
  unknown,
  TUpdateModelOrderRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation(
    (payload: TUpdateModelOrderRequest) =>
      request.put(`/api/admin/models/model-order/${payload.endpoint}/${payload.provider}`, {
        modelDisplayOrder: payload.modelDisplayOrder,
      }),
    {
      onSuccess: (_, variables) => {
        // Invalidate model order query for this endpoint and provider
        queryClient.invalidateQueries([QueryKeys.modelOrder, variables.endpoint, variables.provider]);

        // Invalidate models query to refresh UI with new order
        queryClient.invalidateQueries([QueryKeys.models]);
      },
    },
  );
};

// Mutation: Toggle Model Pin Status
export const useToggleModelPin = (): UseMutationResult<
  {
    success: boolean;
    message: string;
    isPinned: boolean;
    pinnedModels: string[];
  },
  unknown,
  {
    endpoint: string;
    provider: string;
    modelName: string;
  },
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation(
    ({ endpoint, provider, modelName }: { endpoint: string; provider: string; modelName: string }) =>
      request.post(
        `/api/user-models/pin/${endpoint}/${provider}/${encodeURIComponent(modelName)}`,
      ),
    {
      onSuccess: (_, variables) => {
        // Invalidate pinned models query to refetch
        queryClient.invalidateQueries([
          QueryKeys.pinnedModels,
          variables.endpoint,
          variables.provider,
        ]);
      },
    },
  );
};

// Admin Tool Settings Mutation Types

export interface TToggleToolRequest {
  toolId: string;
  enabled: boolean;
}

export interface TUpdateToolSettingRequest {
  toolId: string;
  enabled?: boolean;
  allowedRoles?: string[];
  order?: number;
  description?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface TReorderToolsRequest {
  updates: Array<{
    toolId: string;
    order: number;
  }>;
}

export interface TBulkUpdateToolsRequest {
  updates: Array<{
    toolId: string;
    enabled?: boolean;
    allowedRoles?: string[];
    order?: number;
    description?: string;
    reason?: string;
  }>;
}

export interface TToolMutationResponse {
  setting?: TToolSetting;
  message: string;
  success?: boolean;
}

// Mutation: Toggle Tool Status
export const useToggleToolMutation = (): UseMutationResult<
  TToolMutationResponse,
  unknown,
  TToggleToolRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation(
    (payload: TToggleToolRequest) =>
      request.patch(`/api/admin/tools/${payload.toolId}/toggle`, {
        enabled: payload.enabled,
      }),
    {
      // Optimistic update for immediate feedback
      onMutate: async (newToolData) => {
        await queryClient.cancelQueries(['admin', 'tools']);

        const previousData = queryClient.getQueryData(['admin', 'tools']);

        // Optimistically update tool in cache
        queryClient.setQueryData(['admin', 'tools'], (old: TToolSettingsResponse | undefined) => {
          if (!old || !old.settings) return old;

          const updatedSettings = old.settings.map((setting: TToolSetting) => {
            if (setting.toolId === newToolData.toolId) {
              return { ...setting, enabled: newToolData.enabled };
            }
            return setting;
          });

          return {
            ...old,
            settings: updatedSettings,
            stats: {
              ...old.stats,
              enabled: updatedSettings.filter((s: TToolSetting) => s.enabled).length,
              disabled: updatedSettings.filter((s: TToolSetting) => !s.enabled).length,
            },
          };
        });

        return { previousData };
      },

      onError: (err, newData, context) => {
        if (context?.previousData) {
          queryClient.setQueryData(['admin', 'tools'], context.previousData);
        }
      },

      onSettled: () => {
        queryClient.invalidateQueries(['admin', 'tools']);
        // Also invalidate tool visibility cache for chat components
        queryClient.invalidateQueries([QueryKeys.toolVisibility]);
      },
    },
  );
};

// Mutation: Update Tool Setting
export const useUpdateToolSettingMutation = (): UseMutationResult<
  TToolMutationResponse,
  unknown,
  TUpdateToolSettingRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation(
    (payload: TUpdateToolSettingRequest) => {
      const { toolId, ...data } = payload;
      return request.put(`/api/admin/tools/${toolId}`, data);
    },
    {
      onSuccess: (_, variables) => {
        queryClient.invalidateQueries(['admin', 'tools']);
        queryClient.invalidateQueries(['admin', 'tools', variables.toolId]);
        // Also invalidate tool visibility cache for chat components
        queryClient.invalidateQueries([QueryKeys.toolVisibility]);
      },
    },
  );
};

// Mutation: Reorder Tools
export const useReorderToolsMutation = (): UseMutationResult<
  { updatedCount: number; message: string },
  unknown,
  TReorderToolsRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation(
    (payload: TReorderToolsRequest) =>
      request.put('/api/admin/tools/reorder', payload),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['admin', 'tools']);
      },
    },
  );
};

// Mutation: Bulk Update Tools
export const useBulkUpdateToolsMutation = (): UseMutationResult<
  {
    results: Array<{ toolId: string; status: string; setting?: TToolSetting }>;
    errors: Array<{ toolId: string; error: string }>;
    successCount: number;
    errorCount: number;
    message: string;
  },
  unknown,
  TBulkUpdateToolsRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation(
    (payload: TBulkUpdateToolsRequest) =>
      request.put('/api/admin/tools/bulk', payload),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['admin', 'tools']);
        // Also invalidate tool visibility cache for chat components
        queryClient.invalidateQueries([QueryKeys.toolVisibility]);
      },
    },
  );
};

// Mutation: Clear Tool Settings Cache
export const useClearToolCacheMutation = (): UseMutationResult<
  { cleared: boolean; message: string },
  unknown,
  void,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation(
    () => request.post('/api/admin/tools/clear-cache'),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['admin', 'tools']);
        // Also invalidate tool visibility cache for chat components
        queryClient.invalidateQueries([QueryKeys.toolVisibility]);
      },
    },
  );
};

// Mutation: Reset Tool Settings to Defaults
export const useResetToolSettingsMutation = (): UseMutationResult<
  { settings: TToolSetting[]; message: string },
  unknown,
  void,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation(
    () => request.post('/api/admin/tools/reset'),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['admin', 'tools']);
        queryClient.invalidateQueries(['admin', 'tools', 'defaults']);
        // Also invalidate tool visibility cache for chat components
        queryClient.invalidateQueries([QueryKeys.toolVisibility]);
      },
    },
  );
};

// Organization Membership Mutation Types

export interface TAddUserToOrganizationRequest {
  userId: string;
  organizationId: string;
}

export interface TAddUserToOrganizationByEmailRequest {
  email: string;
}

export interface TRemoveUserFromOrganizationRequest {
  userId: string;
}

export interface TOrganizationMembershipResponse {
  message: string;
  user?: TAdminUser;
}

// Mutation: Add User to Organization (Admin - by userId + organizationId)
export const useAddUserToOrganizationMutation = (): UseMutationResult<
  TOrganizationMembershipResponse,
  unknown,
  TAddUserToOrganizationRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation(
    (payload: TAddUserToOrganizationRequest) =>
      request.post('/api/admin/users/organization/add', payload),
    {
      onSuccess: (_, variables) => {
        queryClient.invalidateQueries([QueryKeys.user, 'admin', 'user', variables.userId]);
        queryClient.invalidateQueries([QueryKeys.user, 'admin', 'users']);
        queryClient.invalidateQueries([QueryKeys.user, 'admin', 'stats']);
        queryClient.invalidateQueries(['admin', 'organizations']);
      },
    },
  );
};

// Mutation: Add User to Organization by Email (ORG_ADMIN)
export const useAddUserToOrganizationByEmailMutation = (): UseMutationResult<
  TOrganizationMembershipResponse,
  unknown,
  TAddUserToOrganizationByEmailRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation(
    (payload: TAddUserToOrganizationByEmailRequest) =>
      request.post('/api/admin/users/organization/add', payload),
    {
      onSuccess: () => {
        queryClient.invalidateQueries([QueryKeys.user, 'admin', 'users']);
        queryClient.invalidateQueries([QueryKeys.user, 'admin', 'stats']);
        queryClient.invalidateQueries(['admin', 'organizations']);
      },
    },
  );
};

// Mutation: Remove User from Organization
export const useRemoveUserFromOrganizationMutation = (): UseMutationResult<
  TOrganizationMembershipResponse,
  unknown,
  TRemoveUserFromOrganizationRequest,
  unknown
> => {
  const queryClient = useQueryClient();

  return useMutation(
    (payload: TRemoveUserFromOrganizationRequest) =>
      request.post('/api/admin/users/organization/remove', payload),
    {
      onSuccess: (_, variables) => {
        queryClient.invalidateQueries([QueryKeys.user, 'admin', 'user', variables.userId]);
        queryClient.invalidateQueries([QueryKeys.user, 'admin', 'users']);
        queryClient.invalidateQueries([QueryKeys.user, 'admin', 'stats']);
        queryClient.invalidateQueries(['admin', 'organizations']);
      },
    },
  );
};