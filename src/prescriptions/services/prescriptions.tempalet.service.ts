import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  CreatePrescriptionTemplateDto,
  UpdatePrescriptionTemplateDto,
  MedicationDto,
} from '../dto/medication.dto';
import { PrescriptionCacheService } from 'src/common/cache/prescription-cache.service';

@Injectable()
export class PrescriptionTemplateService {
  private readonly logger = new Logger(PrescriptionTemplateService.name);

  constructor(
    private prisma: PrismaService,
    private prescriptionCache: PrescriptionCacheService,
  ) {}

  /**
   * Create prescription template
   */
  async createTemplate(
    doctorId: string,
    createDto: CreatePrescriptionTemplateDto,
  ) {
    const { name, notes, medications } = createDto;

    // 2. Validate medications
    this.validateMedications(medications);

    // 3. Check for duplicate name
    const existing = await this.prisma.prescriptionTemplate.findFirst({
      where: {
        doctorId,
        name,
        isActive: true,
      },
    });

    if (existing) {
      throw new ConflictException(
        `Template with name "${name}" already exists`,
      );
    }

    // 4. Create template with medications
    const template = await this.prisma.$transaction(async (tx) => {
      const created = await tx.prescriptionTemplate.create({
        data: {
          doctorId,
          name,
          notes,
          isActive: true,
          medications: {
            create: medications.map((m) => ({
              drugName: m.drugName,
              dosage: m.dosage,
              frequency: m.frequency,
              duration: m.duration,
              instructions: m.instructions,
            })),
          },
        },
        include: { medications: true },
      });

      return created;
    });

    // 5. Invalidate cache
    await this.prescriptionCache.invalidateDoctorTemplates(doctorId);

    this.logger.log(`Template ${template.id} created by doctor ${doctorId}`);

    return {
      id: template.id,
      name: template.name,
      medicationCount: template.medications.length,
      message: 'Template created successfully',
    };
  }

  /**
   * Get all templates for doctor
   */
  async getTemplates(doctorId: string, includeInactive?: boolean) {
    // Check cache (Only cache active templates list for simplicity, or handle both)
    if (!includeInactive) {
      const cached = await this.prescriptionCache.getDoctorTemplates(doctorId);
      if (cached) return cached;
    }

    const where: any = { doctorId };
    if (!includeInactive) {
      where.isActive = true;
    }

    const templates = await this.prisma.prescriptionTemplate.findMany({
      where,
      include: { medications: true },
      orderBy: { createdAt: 'desc' },
    });

    const result = templates.map((t) => ({
      id: t.id,
      name: t.name,
      notes: t.notes || null,
      isActive: t.isActive,
      medicationCount: t.medications.length,
      medications: t.medications,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));

    // Cache active templates list
    if (!includeInactive) {
      await this.prescriptionCache.cacheDoctorTemplates(doctorId, result);
    }

    return result;
  }

  /**
   * Get template by ID
   */
  async getTemplate(templateId: string, doctorId: string) {
    const template = await this.prisma.prescriptionTemplate.findFirst({
      where: { id: templateId, doctorId },
      include: { medications: true },
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    return {
      id: template.id,
      name: template.name,
      notes: template.notes || null,
      isActive: template.isActive,
      medications: template.medications,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    };
  }

  /**
   * Update template
   */
  async updateTemplate(
    templateId: string,
    doctorId: string,
    updateDto: UpdatePrescriptionTemplateDto,
  ) {
    const template = await this.prisma.prescriptionTemplate.findFirst({
      where: { id: templateId, doctorId },
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    // Validate medications if updating
    if (updateDto.medications) {
      this.validateMedications(updateDto.medications);
    }

    // Check for name conflict if updating name
    if (updateDto.name && updateDto.name !== template.name) {
      const existing = await this.prisma.prescriptionTemplate.findFirst({
        where: {
          doctorId,
          name: updateDto.name,
          isActive: true,
          NOT: { id: templateId },
        },
      });

      if (existing) {
        throw new ConflictException(
          `Template with name "${updateDto.name}" already exists`,
        );
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // Delete old medications if updating
      if (updateDto.medications) {
        await tx.templateMedication.deleteMany({
          where: { templateId },
        });

        // Create new medications
        await tx.templateMedication.createMany({
          data: updateDto.medications.map((m) => ({
            templateId,
            drugName: m.drugName,
            dosage: m.dosage,
            frequency: m.frequency,
            duration: m.duration,
            instructions: m.instructions,
          })),
        });
      }

      const result = await tx.prescriptionTemplate.update({
        where: { id: templateId },
        data: {
          name: updateDto.name,
          notes: updateDto.name,
        },
        include: { medications: true },
      });

      return result;
    });

    // Invalidate cache
    await this.prescriptionCache.invalidateDoctorTemplates(doctorId);

    this.logger.log(`Template ${templateId} updated by doctor ${doctorId}`);

    return {
      id: updated.id,
      name: updated.name,
      medicationCount: updated.medications.length,
      message: 'Template updated successfully',
    };
  }

  /**
   * Deactivate template
   */
  async deactivateTemplate(templateId: string, doctorId: string) {
    const template = await this.prisma.prescriptionTemplate.findFirst({
      where: { id: templateId, doctorId },
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    if (!template.isActive) {
      throw new BadRequestException('Template is already inactive');
    }

    await this.prisma.prescriptionTemplate.update({
      where: { id: templateId },
      data: { isActive: false },
    });

    // Invalidate cache
    await this.prescriptionCache.invalidateDoctorTemplates(doctorId);

    return { message: 'Template deactivated successfully' };
  }

  /**
   * Delete template (hard delete)
   */
  async deleteTemplate(templateId: string, doctorId: string) {
    const template = await this.prisma.prescriptionTemplate.findFirst({
      where: { id: templateId, doctorId },
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    await this.prisma.$transaction(async (tx) => {
      // Delete medications first (cascade)
      await tx.templateMedication.deleteMany({
        where: { templateId },
      });

      // Delete template
      await tx.prescriptionTemplate.delete({
        where: { id: templateId },
      });
    });

    // Invalidate cache
    await this.prescriptionCache.invalidateDoctorTemplates(doctorId);

    this.logger.log(`Template ${templateId} deleted by doctor ${doctorId}`);

    return { message: 'Template deleted successfully' };
  }

  /**
   * Clone template to create a new one
   */
  async cloneTemplate(templateId: string, doctorId: string, newName: string) {
    const original = await this.getTemplate(templateId, doctorId);

    if (!original) {
      throw new NotFoundException('Template not found');
    }

    // Create new template with same medications
    return this.createTemplate(doctorId, {
      name: newName,
      notes: `Clone of ${original.name}`,
      medications: await original.medications.map((m) => ({
        drugName: m.drugName,
        dosage: m.dosage,
        frequency: m.frequency,
        duration: m.duration,
        instructions: m.instructions || undefined,
      })),
    });
  }

  /**
   * Get template usage statistics
   */
  async getTemplateStats(doctorId: string) {
    const [activeCount, inactiveCount, totalTemplatesCount, usageAggregator] =
      await Promise.all([
        this.prisma.prescriptionTemplate.count({
          where: { doctorId, isActive: true },
        }),

        this.prisma.prescriptionTemplate.count({
          where: { doctorId, isActive: false },
        }),

        this.prisma.prescriptionTemplate.count({
          where: { doctorId },
        }),

        this.prisma.prescriptionTemplate.aggregate({
          where: { doctorId },
          _sum: {
            usageCount: true,
          },
        }),
      ]);

    const topUsedTemplates = await this.prisma.prescriptionTemplate.findMany({
      where: { doctorId, isActive: true },
      select: {
        id: true,
        name: true,
        usageCount: true,
        _count: {
          select: { medications: true },
        },
      },
      orderBy: {
        usageCount: 'desc',
      },
      take: 5,
    });

    const topTemplatesFormatted = topUsedTemplates.map((t) => ({
      id: t.id,
      name: t.name,
      usageCount: t.usageCount,
      medicationCount: t._count.medications,
    }));

    return {
      summary: {
        totalTemplates: totalTemplatesCount,
        activeTemplates: activeCount,
        inactiveTemplates: inactiveCount,
        totalUsages: usageAggregator._sum.usageCount || 0,
      },
      topTemplates: topTemplatesFormatted,
    };
  }

  // ==================== PRIVATE HELPERS ====================

  private validateMedications(medications: MedicationDto[]) {
    if (!medications || medications.length === 0) {
      throw new BadRequestException('At least one medication is required');
    }

    for (const med of medications) {
      if (!med.drugName || !med.dosage || !med.frequency || !med.duration) {
        throw new BadRequestException(
          'All medications must include: drugName, dosage, frequency, duration',
        );
      }
    }
  }
}
