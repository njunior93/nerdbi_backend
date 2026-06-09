import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany } from 'typeorm'
import { Session } from '../../session/Entity/session.entity'
@Entity()
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ unique: true })
  email: string

  @Column()
  password: string

  @Column({ nullable: true })
  connectionString: string

  @CreateDateColumn()
  createdAt: Date

  @OneToMany(() => Session, session => session.user)
  sessions: Session[]
}