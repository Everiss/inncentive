import { Test, TestingModule } from '@nestjs/testing';
import { ImportsController } from './imports.controller';

describe('ImportsController', () => {
  let controller: ImportsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ImportsController],
    }).compile();

    controller = module.get<ImportsController>(ImportsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
