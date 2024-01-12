import {
    Controller,
    Get,
    Header,
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
    PartnerProperties,
} from './partners.service';


@Controller('/api/partners')
@ApiTags('Partners controller')
export class PartnersController {
    private readonly logger = new Logger(PartnersController.name);

    constructor(private readonly partnersService: PartnersService) { }

    // WIP: XPATH Injection
    @Get('query')
    @ApiQuery({
        name: 'property',
        enum: PartnerProperties,
        example: 'name',
        required: true,
    })
    @ApiQuery({
        name: 'subProperty',
        example: "Possible options - " + PartnersService.getAllSubPropertiesAsText(),
        required: false,
    })
    @Header('content-type', 'text/xml')
    @ApiOperation({
        description: API_DESC_QUERY_PARTNERS,
    })
    @ApiOkResponse({
        type: String,
    })
    async get(@Query('property') property: PartnerProperties, @Query('subProperty') subProperty: string = ''): Promise<String> {
        this.logger.debug(`Getting partners with property ${property} and sub-property ${subProperty}`);

        let xpathExpression = `//${property}`

        // Add element's attribute selector if supplied
        if (subProperty) {
            xpathExpression += `[@${subProperty}]`
        }

        let nodes = this.partnersService.selectPartnerPropertyByXPATH(xpathExpression)

        // TODO: Return result in a nicer manner
        let finalXML = `<?xml version="1.0" encoding="UTF-8"?>\n${nodes.join('\n')}`;
        return finalXML;
    }
}