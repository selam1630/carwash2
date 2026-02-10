import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('washer_profiles')
export class WasherProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User, (user) => user.washerProfile, { onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  @Column()
  fullName: string;

  @Column()
  phone: string;

  @Column()
  mugShot?: string;

  @Column({ unique: true })
  nationalId: string;

  @Column()
  nationalIdPhoto: string;

  @Column()
  sponsorNationalId: string;

  @Column()
  sponsorNationalIdPhoto: string;

  @Column('jsonb')
  bankDetails: Record<string, any>;

  @Column({ type: 'decimal', precision: 10, scale: 1 })
  depositeAmount: number; // e.g., { bankName: string, accountNumber: string, accountHolderName: string }
}
