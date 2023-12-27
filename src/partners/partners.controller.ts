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

    // WIP: XPATH Injection (place in hierarchy is probably wrong)
    @Get('query')
    @ApiQuery({
        name: 'property',
        enum: PartnerProperties,
        example: 'name',
        required: true,
    })
    @ApiQuery({
        name: 'subCategory',
        example: PartnersService.getPropertiesSubCategoriesAsText(),
        required: false,
    })
    @Header('content-type', 'text/xml')
    @ApiOperation({
        description: API_DESC_QUERY_PARTNERS,
    })
    @ApiOkResponse({
        type: String,
    })
    async get(@Query('property') property: PartnerProperties, @Query('subCategory') subCategory: string): Promise<String> {
        this.logger.debug(`Getting partners with property ${property} and sub-category ${subCategory}`);

        let xpathExpression = `//${property}`

        // Add element's attribute selector if supplied
        if (subCategory) {
            xpathExpression += `[@${subCategory}]`
        }

        let nodes = this.partnersService.selectPartnerPropertyByXPATH(xpathExpression)
        return nodes.toString()
    }
}