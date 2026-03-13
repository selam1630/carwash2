import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { User } from './user.entity';
import { SalesProfile } from './sales-profile.entity';
import { piiValueTransformer } from '../../../common/security/pii-crypto';

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

  @Column({ nullable: true })
  carFrontPhoto?: string;

  @Column({ nullable: true })
  carBackPhoto?: string;

  @Column({ nullable: true, transformer: piiValueTransformer })
  secondaryPhone?: string;

  @Column({ nullable: true, transformer: piiValueTransformer })
  driverLicensePhoto?: string;

  @ManyToOne(() => SalesProfile, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'registeredBySalesId' })
  registeredBySales: SalesProfile | null;
}
