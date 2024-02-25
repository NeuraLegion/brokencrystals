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
    API_DESC_QUERY_PARTNERS_RAW,
    API_DESC_PARTNERS_LOGIN,
    API_DESC_SEARCH_PARTNERS_NAMES
} from './partners.controller.swagger.desc';
import {
    PartnersService,
} from './partners.service';


@Controller('/api/partners')
@ApiTags('Partners controller')
export class PartnersController {
    private readonly logger = new Logger(PartnersController.name);

    constructor(private readonly partnersService: PartnersService) { }

    // **** This is a general XPATH injection EP - Will accept anything ****
    @Get('query')
    @ApiQuery({
        name: 'xpath',
        type: 'string',
        example: '/partners/partner/name',
        required: true,
    })
    @Header('content-type', 'text/xml')
    @ApiOperation({
        description: API_DESC_QUERY_PARTNERS_RAW,
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

    // **** This is a boolean based XPATH injection EP ****
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
        description: API_DESC_PARTNERS_LOGIN,
    })
    @ApiOkResponse({
        type: String,
    })
    async partnerLogin(@Query('username') username: string, @Query('password') password: string): Promise<String> {
        this.logger.debug(`Trying to login partner with username ${username} using password ${password}`);

        try {
            let xpath = `//partners/partner[username/text()='${username}' and password/text()='${password}']/*`
            let xmlStr = this.partnersService.getPartnersProperties(xpath);

            // Check if account's data contains any information - If not, the login failed!
            if (!(xmlStr && xmlStr.includes('password') && xmlStr.includes('wealth'))) {
                throw new Error("Login attempt failed!");
            }

            return xmlStr;
        } catch (err) {
            let strErr = err.toString();
            if (strErr.includes('Unterminated string literal')) {
                err = 'Error in XPath expression'
            }
            throw new HttpException(`Access denied to partner's account. ${err}`, HttpStatus.FORBIDDEN);
        }
    }


    // **** This is a string based XPATH injection EP ****
    @Get('searchPartners')
    @ApiQuery({
        name: 'keyword',
        type: 'string',
        example: 'Walter',
        required: true,
    })
    @Header('content-type', 'text/xml')
    @ApiOperation({
        description: API_DESC_SEARCH_PARTNERS_NAMES,
    })
    @ApiOkResponse({
        type: String,
    })
    async searchPartners(@Query('keyword') keyword: string): Promise<String> {
        this.logger.debug(`Searching partner names by the keyword "${keyword}"`);

        try {
            let xpath = `//partners/partner/name[contains(., '${keyword}')]`
            return this.partnersService.getPartnersProperties(xpath);
        } catch (err) {
            let strErr = err.toString();
            if (strErr.includes('XPath parse error') || strErr.includes('Unterminated string literal')) {
                err = 'Error in XPath expression'
            }
            throw new HttpException(`Couldn't find partners. ${err}`, HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
}