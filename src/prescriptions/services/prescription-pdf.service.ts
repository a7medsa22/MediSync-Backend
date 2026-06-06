import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import PDFDocument from 'pdfkit';
import express from 'express';

@Injectable()
export class PrescriptionPdfService {
    constructor(private readonly prisma: PrismaService) { }

    async generatePrescriptionPdf(prescriptionId: string, res: express.Response): Promise<void> {
        const prescription = await this.prisma.prescription.findUnique({
            where: { id: prescriptionId },
            include: {
                doctor: {
                    include: { user: { select: { firstName: true, lastName: true } } },
                },
                patient: {
                    include: { user: { select: { firstName: true, lastName: true } } },
                },
                prescriptionMedications: true,
            },
        });

        if (!prescription) {
            throw new NotFoundException('Prescription not found');
        }

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename=prescription-${prescriptionId}.pdf`);

        const doc = new PDFDocument({ size: 'A4', margin: 50 });

        doc.pipe(res);
        doc
            .fontSize(20)
            .fillColor('#1a73e8')
            .text(`Dr. ${prescription.doctor.user.firstName} ${prescription.doctor.user.lastName}`, { align: 'left' });

        doc
            .fontSize(10)
            .fillColor('#5f6368')
            .text('Medical Management System (MediSync)', { align: 'left' })
            .moveDown(2);

        doc.moveTo(50, 100).lineTo(545, 100).stroke('#e0e0e0').moveDown(2);

        doc.fillColor('#000000').fontSize(12);
        doc.text(`Patient Name: ${prescription.patient.user.firstName} ${prescription.patient.user.lastName}`);
        doc.text(`Date: ${new Date(prescription.prescribedAt).toLocaleDateString()}`);
        doc.text(`Prescription ID: ${prescription.id}`);
        doc.moveDown(2);

        doc.fontSize(16).fillColor('#1a73e8').text('Rx (Medications):', { underline: true }).moveDown(1);

        doc.fillColor('#000000').fontSize(12);

        prescription.prescriptionMedications.forEach((med, index) => {
            doc
                .fontSize(12)
                .fillColor('#000000')
                .text(`${index + 1}. ${med.drugName} --------- ${med.dosage}`);

            doc
                .fontSize(10)
                .fillColor('#5f6368')
                .text(`   Frequency: ${med.frequency} | Duration: ${med.duration}`)
                .text(`   Instructions: ${med.instructions || 'Take as directed'}`)
                .moveDown(1);
        });

        if (prescription.notes) {
            doc.moveDown(1);
            doc.fontSize(12).font('Helvetica-Bold').fillColor('#000000').text('Notes:').font('Helvetica');
            doc.fontSize(10).fillColor('#5f6368').text(prescription.notes);
        }

        const bottomY = doc.page.height - 100;
        doc.moveTo(50, bottomY).lineTo(545, bottomY).stroke('#e0e0e0');

        doc
            .fontSize(9)
            .fillColor('#9aa0a6')
            .text('This is an electronically generated prescription from MediSync platform.', 50, bottomY + 15, { align: 'center' });


        doc.end();
    }
}