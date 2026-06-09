import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, OneToMany } from 'typeorm'
import { User } from '../../auth/Entity/user.entity'
import { Message } from './message.entity'

@Entity()
export class Session {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column()
  title: string

  @CreateDateColumn()
  createdAt: Date

  @ManyToOne(() => User, user => user.sessions)
  user: User

  @OneToMany(() => Message, message => message.session)
  messages: Message[]
}