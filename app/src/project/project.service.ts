import { Injectable } from '@nestjs/common';
import { AxiosResponse, AxiosError } from 'axios';

import { HttpRequestsService } from '../core/http-requests/http-requests.service';
import { Project } from './interfaces/project.interface';
import { TimeService } from '../time/time.service';

@Injectable()
export class ProjectService {
    constructor(private readonly httpRequestsService: HttpRequestsService, private readonly timeService: TimeService) {}

    getProjectList() {
        const query = `{
            project_v2(order_by: {name: desc}) {
                id
                name
                is_active
                project_color {
                    name
                }
            }
        }
        `;

        return new Promise((resolve, reject) => {
            this.httpRequestsService
                .request(query)
                .subscribe((res: AxiosResponse) => resolve(res), (error: AxiosError) => reject(error));
        });
    }

    getAdminProjectList() {
        const query = `{
            project_v2(order_by: {name: asc}, limit: 100) {
                id
                is_active
                name
                timer {
                    start_datetime
                    end_datetime
                }
            }
        }
        `;

        return new Promise((resolve, reject) => {
            this.httpRequestsService
                .request(query)
                .subscribe((res: AxiosResponse) => resolve(res), (error: AxiosError) => reject(error));
        });
    }

    getUserProjectList(userId: string) {
        const query = `{
            project_v2(order_by: {name: asc})  {
                id
                is_active
                name
                timer(where: {user_id: {_eq: "${userId}"}}) {
                    start_datetime
                    end_datetime
                }
            }
        }
        `;

        return new Promise((resolve, reject) => {
            this.httpRequestsService
                .request(query)
                .subscribe((res: AxiosResponse) => resolve(res), (error: AxiosError) => reject(error));
        });
    }

    getReportsProject(projectName: string, userEmail: string, startDate: string, endDate: string) {
        const query = `{
            project_v2(where: {name: {_eq: "${projectName}"}}) {
                timer(where: {
                    user: {email: {_in: ["${userEmail}"]}},
                    start_datetime: {_gte: "${startDate}"},
                    end_datetime: {_lt: "${endDate}"}
                }) {
                    issue
                    start_datetime
                    end_datetime
                }
            }
        }
        `;

        return new Promise((resolve, reject) => {
            this.httpRequestsService
                .request(query)
                .subscribe((res: AxiosResponse) => resolve(res), (error: AxiosError) => reject(error));
        });
    }

    getReportsProjects(projectNames: string[], userEmails: string[], startDate: string, endDate: string) {
        const projectWhereStatement = projectNames.length
            ? `(where: {name: {_in: [${projectNames
                  .map(projectName => `"${projectName}"`)
                  .join(',')}]}}, order_by: {name: asc})`
            : '(order_by: {name: asc})';

        const userWhereStatement = userEmails.length
            ? `user: {email: {_in: [${userEmails.map(userEmail => `"${userEmail}"`).join(',')}]}}`
            : '';
        let startDateStatement = '';
        let endDateStatement = '';

        if (startDate) {
            endDate = endDate ? endDate : startDate;

            startDate = this.timeService.getISOTimeByGivenValue(startDate).slice(0, -1);
            endDate = this.timeService
                .getISOTimeByGivenValue(this.timeService.getTimestampByGivenValue(endDate) + 24 * 60 * 60 * 1000 - 1)
                .slice(0, -1);
            startDateStatement = `start_datetime: {_gte: "${startDate}"}`;
            endDateStatement = `end_datetime: {_lt: "${endDate}"}`;
        }

        let timerStatementArray = [];
        if (userWhereStatement) {
            timerStatementArray.push(userWhereStatement);
        }
        if (startDateStatement) {
            timerStatementArray.push(startDateStatement);
        }
        if (endDateStatement) {
            timerStatementArray.push(endDateStatement);
        }
        const timerStatementString = timerStatementArray.join(', ');
        const timerWhereStatement = timerStatementString ? `(where: {${timerStatementString}})` : '';

        const query = `{
            project_v2 ${projectWhereStatement} {
                id
                name
                timer ${timerWhereStatement} {
                    start_datetime
                    end_datetime         
                }
            }
        }`;

        return new Promise((resolve, reject) => {
            this.httpRequestsService
                .request(query)
                .subscribe((res: AxiosResponse) => resolve(res), (error: AxiosError) => reject(error));
        });
    }

    addProject(project: Project) {
        const { name, projectColorId } = project;

        const query = `mutation {
            insert_project_v2(
                objects: [
                    {
                        name: "${name.toLowerCase().trim()}",
                        project_color_id: "${projectColorId}"
                    }
                ]
            ){
                affected_rows
            }
        }
        `;

        return new Promise((resolve, reject) => {
            this.httpRequestsService
                .request(query)
                .subscribe((res: AxiosResponse) => resolve(res), (error: AxiosError) => reject(error));
        });
    }

    getProjectById(id: string) {
        const query = `{
            project_v2 (where: {id: {_eq: "${id}"}}) {
                id
                name
                project_color{ 
                    id
                    name
                }
            }
        }
        `;

        return new Promise((resolve, reject) => {
            this.httpRequestsService
                .request(query)
                .subscribe((res: AxiosResponse) => resolve(res), (error: AxiosError) => reject(error));
        });
    }

    updateProjectById(id: string, project: Project) {
        const { name, projectColorId } = project;

        const query = `mutation {
            update_project_v2(
                where: {id: {_eq: "${id}"}},
                _set: {
                    name: "${name.toLowerCase().trim()}",
                    project_color_id: "${projectColorId}"
                }
            ) {
                affected_rows
            }
        }
        `;

        return new Promise((resolve, reject) => {
            this.httpRequestsService
                .request(query)
                .subscribe((res: AxiosResponse) => resolve(res), (error: AxiosError) => reject(error));
        });
    }

    deleteProjectById(id: string) {
        const query = `mutation {
            delete_project_v2(where: {id: {_eq: "${id}"}}) {
                affected_rows
            }
        }
        `;

        return new Promise((resolve, reject) => {
            this.httpRequestsService
                .request(query)
                .subscribe((res: AxiosResponse) => resolve(res), (error: AxiosError) => reject(error));
        });
    }
}
