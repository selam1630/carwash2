import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('owner_profiles')
export class OwnerProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User, (user) => user.ownerProfile, { onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  @Column()
  fullName: string;

  @Column()
  carType: string;

  @Column({ unique: true })
  plateNumber: string;

  @Column()
  carFrontPhoto?: string;

  @Column()
  carBackPhoto?: string;

  @Column({ nullable: true })
  secondaryPhone?: string;

  @Column({ nullable: true })
  driverLicensePhoto?: string;
}
