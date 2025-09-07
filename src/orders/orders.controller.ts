import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { QueryOrderDto } from './dto/query-order.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Orders')
@Controller('orders')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new order' })
  @ApiResponse({ status: 201, description: 'Order created successfully' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createOrderDto: CreateOrderDto, @CurrentUser() user: any) {
    return {
      success: true,
      message: 'Order created successfully',
      data: await this.ordersService.create(createOrderDto),
    };
  }

  @Get()
  @ApiOperation({ summary: 'Get all orders with filtering and pagination' })
  @ApiResponse({ status: 200, description: 'Orders retrieved successfully' })
  async findAll(@Query() queryDto: QueryOrderDto) {
    return {
      success: true,
      message: 'Orders retrieved successfully',
      data: await this.ordersService.findAll(queryDto),
    };
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get order statistics' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
  async getStats(@Query('school_id') schoolId?: string) {
    return {
      success: true,
      message: 'Statistics retrieved successfully',
      data: await this.ordersService.getOrderStats(schoolId),
    };
  }

  @Get('school/:schoolId')
  @ApiOperation({ summary: 'Get orders by school ID' })
  @ApiResponse({ status: 200, description: 'School orders retrieved successfully' })
  async findBySchool(
    @Param('schoolId') schoolId: string,
    @Query() queryDto: QueryOrderDto,
  ) {
    return {
      success: true,
      message: 'School orders retrieved successfully',
      data: await this.ordersService.findBySchool(schoolId, queryDto),
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get order by ID' })
  @ApiResponse({ status: 200, description: 'Order retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async findOne(@Param('id') id: string) {
    return {
      success: true,
      message: 'Order retrieved successfully',
      data: await this.ordersService.findOne(id),
    };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update order by ID' })
  @ApiResponse({ status: 200, description: 'Order updated successfully' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async update(@Param('id') id: string, @Body() updateOrderDto: UpdateOrderDto) {
    return {
      success: true,
      message: 'Order updated successfully',
      data: await this.ordersService.update(id, updateOrderDto),
    };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete order by ID' })
  @ApiResponse({ status: 200, description: 'Order deleted successfully' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id') id: string) {
    await this.ordersService.remove(id);
    return {
      success: true,
      message: 'Order deleted successfully',
    };
  }
}