import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from './entities/user.entity';
import { OwnerProfile } from './entities/owner-profile.entity';
import { WasherProfile } from './entities/washer-profile.entity';
import { UpdateOwnerProfileDto } from './dto/update-owner-profile.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(OwnerProfile) private ownerRepo: Repository<OwnerProfile>,
    @InjectRepository(WasherProfile)
    private washerRepo: Repository<WasherProfile>,
  ) {}

  async getMe(user: User) {
    if (user.role === UserRole.OWNER) {
      await this.userRepo.preload({ id: user.id, ownerProfile: {} });
      const fullUser = await this.userRepo.findOne({
        where: { id: user.id },
        relations: ['ownerProfile'],
      });
      return fullUser;
    }
    return user;
  }

  async updateOwnerProfile(user: User, dto: UpdateOwnerProfileDto) {
    if (user.role !== UserRole.OWNER)
      throw new BadRequestException('Only owners can update this');

    let profile = await this.ownerRepo.findOne({
      where: { user: { id: user.id } },
    });
    if (!profile) {
      profile = this.ownerRepo.create({ user, ...dto });
    } else {
      Object.assign(profile, dto);
    }

    return this.ownerRepo.save(profile);
  }

  async uploadPhoto(user: User, field: string, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');

    const ext = file.originalname.split('.').pop();
    const filename = `${field}-${user.id}.${ext}`;
    let path: string | null = null;

    if (user.role === UserRole.OWNER) {
      if (!['carFront', 'carBack', 'driverLicense'].includes(field)) {
        throw new BadRequestException('Invalid field');
      }
      path = `uploads/${field.startsWith('car') ? 'cars' : 'licenses'}/${filename}`;
      const profile = await this.ownerRepo.findOne({
        where: { user: { id: user.id } },
      });
      if (!profile) throw new NotFoundException('Create profile first');
      if (field === 'carFront') profile.carFrontPhoto = path;
      if (field === 'carBack') profile.carBackPhoto = path;
      if (field === 'driverLicense') profile.driverLicensePhoto = path;
      await this.ownerRepo.save(profile);
    }
    // Washer similar later

    // In production: fs.rename or upload to cloud
    // For dev: assume Multer stores it
    if (!path) {
      throw new BadRequestException('Photo upload not supported for this user role or field');
    }
    return { message: 'Uploaded', path };
  }
}
