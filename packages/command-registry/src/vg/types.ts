/**
 * VG Command type constants.
 * Kept in a separate module so the main CommandType enum is not modified.
 * VG commands use these string literals as their `type` discriminator.
 */
export const VG_COMMAND_TYPES = {
    CREATE_VG_TEMPLATE:          'VG_CREATE_TEMPLATE',
    APPLY_VG_TEMPLATE_TO_MODEL:  'VG_APPLY_TEMPLATE_TO_MODEL',
    SET_VG_CATEGORY_STYLE:       'VG_SET_CATEGORY_STYLE',
} as const;

export type VGCommandType = typeof VG_COMMAND_TYPES[keyof typeof VG_COMMAND_TYPES];
