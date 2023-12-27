import { Injectable, Logger } from '@nestjs/common';

var xpath = require('xpath');

export enum PartnerProperties {
  Name = 'name',
  Age = 'age',
  Profession = 'profession',
  Residency = 'residency',
}

@Injectable()
export class PartnersService {
  private readonly log: Logger = new Logger(PartnersService.name);

  private static readonly partnerSubPropertiesMapping = {
    "residency": ['country', 'state', 'city']
  }

  private readonly XML_AUTHORS_STR: string = `
    <?xml version="1.0" encoding="UTF-8"?>
      <partners>
        <partner>
          <name>Walter White</name>
          <age>50</age>
          <profession>Chemistry Teacher</profession>
          <residency country="US" state="New Mexico" city="Albuquerque" />
        </partner>

        <partner>
          <name>Anna Meir</name>
          <age>28</age>
          <profession>Security Analyst</profession>
          <residency country="IL" city="Haifa" />
        </partner>
      </partners>
    `;

  private getPartnersXMLObj(): object {
    let xmlAuthorsObj = new DOMParser().parseFromString(this.XML_AUTHORS_STR, "text/xml");
    return xmlAuthorsObj;
  }

  selectPartnerPropertyByXPATH(xpathExpression: string): Array<string> {
    let partnersXMLObj = this.getPartnersXMLObj();
    return xpath.select(xpathExpression, partnersXMLObj);
  }

  static getPropertiesSubCategoriesAsText(): string {
    let mappings = [];
    for (const [key, value] of Object.entries(this.partnerSubPropertiesMapping)) {
      mappings.push(`${key} -> ${value}`)
    }

    return mappings.join(' | ');
  }
}
