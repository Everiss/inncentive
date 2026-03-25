import { Test, TestingModule } from '@nestjs/testing';
import { FormpdController } from './formpd.controller';

describe('FormpdController', () => {
  let controller: FormpdController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FormpdController],
    }).compile();

    controller = module.get<FormpdController>(FormpdController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
