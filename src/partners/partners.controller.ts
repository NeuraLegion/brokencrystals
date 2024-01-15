import {
    Controller,
    Get,
    Header,
    HttpException,
    HttpStatus,
    Logger,
    Query,
} from '@nestjs/common';
import {
    ApiOkResponse,
    ApiOperation,
    ApiQuery,
    ApiTags,
} from '@nestjs/swagger';
import {
    API_DESC_QUERY_PARTNERS
} from './partners.controller.swagger.desc';
import {
    PartnersService,
} from './partners.service';


@Controller('/api/partners')
@ApiTags('Partners controller')
export class PartnersController {
    private readonly logger = new Logger(PartnersController.name);

    constructor(private readonly partnersService: PartnersService) { }

    // **** This is a general XPATH injection ep - Will accept anything ****
    @Get('query')
    @ApiQuery({
        name: 'xpath',
        type: 'string',
        example: '/partners/partner/name',
        required: true,
    })
    @Header('content-type', 'text/xml')
    @ApiOperation({
        description: API_DESC_QUERY_PARTNERS,
    })
    @ApiOkResponse({
        type: String,
    })
    async queryPartnersRaw(@Query('xpath') xpath: string): Promise<String> {
        this.logger.debug(`Getting partners with xpath expression "${xpath}"`);

        try {
            return this.partnersService.getPartnersProperties(xpath);
        } catch (err) {
            throw new HttpException(`Failed to load XML using XPATH. Details: ${err}`, HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    // **** This is an XPATH injection boolean detection ep ****
    @Get('partnerLogin')
    @ApiQuery({
        name: 'username',
        type: 'string',
        example: 'walter100',
        required: true,
    })
    @ApiQuery({
        name: 'password',
        type: 'string',
        example: 'Heisenberg123',
        required: true,
    })
    @Header('content-type', 'text/xml')
    @ApiOperation({
        description: API_DESC_QUERY_PARTNERS,
    })
    @ApiOkResponse({
        type: String,
    })
    async partnerLogin(@Query('username') username: string, @Query('password') password: string): Promise<String> {
        this.logger.debug(`Trying to login partner with username ${username} using password ${password}`);

        try {
            let xpath = `//partners/partner[username/text()='${username}' and password/text()='${password}']/*`
            return this.partnersService.getPartnersProperties(xpath);
        } catch (err) {
            throw new HttpException(`Access denied to partner's wealth`, HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }


    // **** This is an XPATH injection string detection ep ****
    @Get('searchPartners')
    @ApiQuery({
        name: 'keyword',
        type: 'string',
        example: 'Walter',
        required: true,
    })
    @Header('content-type', 'text/xml')
    @ApiOperation({
        description: API_DESC_QUERY_PARTNERS,
    })
    @ApiOkResponse({
        type: String,
    })
    async searchPartners(@Query('keyword') keyword: string): Promise<String> {
        this.logger.debug(`Searching partner names by the keyword "${keyword}"`);

        try {
            let xpath = `//partners/partner[contains(., '${keyword}')]/name`
            return this.partnersService.getPartnersProperties(xpath);
        } catch (err) {
            throw new HttpException(`Couldn't find partners`, HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
}