/**
 * Business Attribute service.
 *
 * Attributes are free-form key/value pairs on the tenant's business
 * profile (e.g. has_wifi = true, cuisine = "Italian"). Type-tagged so
 * clients can render the right widget.
 */

import { AuditAction, BusinessAttributeType } from "@prisma/client";
import { businessAttributeRepository } from "@/server/repositories/businessAttribute.repository";
import { businessProfileService } from "@/server/services/businessProfile.service";
import { auditRepository } from "@/server/repositories/audit.repository";
import { NotFoundError, ValidationError } from "@/server/utils/errors";
import type { AuthContext } from "@/server/auth/requireSession";
import type {
  BulkSetAttributesInput,
  SetAttributeInput,
} from "@/server/validators/business.schema";

const MAX_ATTRIBUTES_PER_TENANT = 200;

// Basic value validation per declared type.
function validateValue(value: string, type: BusinessAttributeType): void {
  switch (type) {
    case BusinessAttributeType.BOOLEAN:
      if (!["true", "false"].includes(value.toLowerCase())) {
        throw new ValidationError("Boolean attribute value must be 'true' or 'false'");
      }
      return;
    case BusinessAttributeType.NUMBER:
      if (Number.isNaN(Number(value))) {
        throw new ValidationError("Number attribute value must be numeric");
      }
      return;
    case BusinessAttributeType.URL:
      if (!/^https?:\/\/.+\..+/i.test(value)) {
        throw new ValidationError("URL attribute value must be a valid http(s) URL");
      }
      return;
    default:
      return;
  }
}

export const businessAttributeService = {
  async list(ctx: AuthContext) {
    const { profile } = await businessProfileService.getForTenant(ctx);
    return businessAttributeRepository.listForProfile(profile.id);
  },

  async set(ctx: AuthContext, input: SetAttributeInput) {
    validateValue(input.value, input.type);
    const { profile } = await businessProfileService.getForTenant(ctx);

    const existing = await businessAttributeRepository.findByKey(
      profile.id,
      input.key,
    );
    if (!existing) {
      const count = await businessAttributeRepository.countForProfile(profile.id);
      if (count >= MAX_ATTRIBUTES_PER_TENANT) {
        throw new ValidationError(
          `Maximum of ${MAX_ATTRIBUTES_PER_TENANT} attributes allowed`,
        );
      }
    }

    const attr = await businessAttributeRepository.upsert({
      profileId: profile.id,
      key: input.key,
      value: input.value,
      type: input.type,
    });

    await auditRepository.record({
      action: AuditAction.BUSINESS_ATTRIBUTE_SET,
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      metadata: { key: input.key, type: input.type },
    });

    return attr;
  },

  async bulkSet(ctx: AuthContext, input: BulkSetAttributesInput) {
    for (const a of input.attributes) validateValue(a.value, a.type);
    const { profile } = await businessProfileService.getForTenant(ctx);

    // Enforce cap post-merge.
    const currentKeys = new Set(
      (await businessAttributeRepository.listForProfile(profile.id)).map(
        (a) => a.key,
      ),
    );
    const inputKeys = new Set(input.attributes.map((a) => a.key));
    const newKeys = [...inputKeys].filter((k) => !currentKeys.has(k));
    if (currentKeys.size + newKeys.length > MAX_ATTRIBUTES_PER_TENANT) {
      throw new ValidationError(
        `Maximum of ${MAX_ATTRIBUTES_PER_TENANT} attributes allowed`,
      );
    }

    const result = await businessAttributeRepository.bulkUpsert(
      profile.id,
      input.attributes,
    );

    await auditRepository.record({
      action: AuditAction.BUSINESS_ATTRIBUTE_SET,
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      metadata: {
        keys: input.attributes.map((a) => a.key),
        count: result.length,
        bulk: true,
      },
    });

    return result;
  },

  async remove(ctx: AuthContext, id: string) {
    const { profile } = await businessProfileService.getForTenant(ctx);
    const attr = await businessAttributeRepository.findByIdInProfile(
      profile.id,
      id,
    );
    if (!attr) throw new NotFoundError("Attribute not found");

    await businessAttributeRepository.deleteById(profile.id, id);

    await auditRepository.record({
      action: AuditAction.BUSINESS_ATTRIBUTE_REMOVED,
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      metadata: { key: attr.key },
    });

    return { removed: id, key: attr.key };
  },
};
