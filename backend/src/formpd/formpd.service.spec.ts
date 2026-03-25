import { Test, TestingModule } from '@nestjs/testing';
import { FormpdService } from './formpd.service';

describe('FormpdService', () => {
  let service: FormpdService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FormpdService],
    }).compile();

    service = module.get<FormpdService>(FormpdService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
