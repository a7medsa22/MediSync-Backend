import { Test, TestingModule } from '@nestjs/testing';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from '../service/appointments.service';
import { SlotGeneratorService } from '../service/slot-generator.service';

describe('AppointmentsController', () => {
  let controller: AppointmentsController;
  const appointmentsServiceMock = {
    getAvailableSlots: jest.fn(),
    getDoctorAppointments: jest.fn(),
    getPatientAppointments: jest.fn(),
    getAppointmentById: jest.fn(),
    bookAppointment: jest.fn(),
    confirmAppointment: jest.fn(),
    cancelAppointment: jest.fn(),
    rescheduleAppointment: jest.fn(),
    completeAppointment: jest.fn(),
    scheduleReminders: jest.fn(),
    sendReminder: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppointmentsController],
      providers: [
        { provide: AppointmentsService, useValue: appointmentsServiceMock },
        { provide: SlotGeneratorService, useValue: {} },
      ],
    }).compile();

    controller = module.get<AppointmentsController>(AppointmentsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('calls the service to complete an appointment', async () => {
    const result = {
      id: 'apt_123',
      status: 'COMPLETED',
      message: 'Appointment completed successfully',
    };

    appointmentsServiceMock.completeAppointment.mockResolvedValue(result);

    await expect(controller.complete('apt_123')).resolves.toEqual(result);
    expect(appointmentsServiceMock.completeAppointment).toHaveBeenCalledWith(
      'apt_123',
    );
  });
});
