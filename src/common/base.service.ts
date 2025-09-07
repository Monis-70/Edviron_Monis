import { Model, Document, FilterQuery, UpdateQuery, QueryOptions } from 'mongoose';

export abstract class BaseService<T extends Document> {
  constructor(private readonly model: Model<T>) {}

  async create(createDto: any): Promise<T> {
    const createdDocument = new this.model(createDto);
    return createdDocument.save();
  }

  async findAll(
    filter: FilterQuery<T> = {},
    options: QueryOptions = {},
  ): Promise<T[]> {
    return this.model.find(filter, null, options).exec();
  }

  async findOne(filter: FilterQuery<T>): Promise<T | null> {
    return this.model.findOne(filter).exec();
  }

  async findById(id: string): Promise<T | null> {
    return this.model.findById(id).exec();
  }

  async update(
    filter: FilterQuery<T>,
    updateDto: UpdateQuery<T>,
  ): Promise<T | null> {
    return this.model
      .findOneAndUpdate(filter, updateDto, { new: true })
      .exec();
  }

  async delete(filter: FilterQuery<T>): Promise<T | null> {
    return this.model.findOneAndDelete(filter).exec();
  }

  async count(filter: FilterQuery<T> = {}): Promise<number> {
    return this.model.countDocuments(filter).exec();
  }

  async paginate(
    filter: FilterQuery<T> = {},
    page: number = 1,
    limit: number = 10,
    sort: any = { created_at: -1 },
  ) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.model.find(filter).sort(sort).skip(skip).limit(limit).exec(),
      this.model.countDocuments(filter),
    ]);

    return {
      data,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  }
}