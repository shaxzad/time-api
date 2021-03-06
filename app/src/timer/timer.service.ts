import { Injectable } from '@nestjs/common';
import { AxiosResponse, AxiosError } from 'axios';

import { HttpRequestsService } from '../core/http-requests/http-requests.service';
import { Timer } from './interfaces/timer.interface';
import { TimeService } from '../time/time.service';

@Injectable()
export class TimerService {
    constructor(private readonly httpRequestsService: HttpRequestsService, private readonly timeService: TimeService) {}

    getTimer(userId: string, jiraWorklogId?: string): Promise<Timer | null> {
        let jiraQuery = ``;
        if (jiraWorklogId) {
            jiraQuery = `jira_worklog_id: {
                _eq: "${jiraWorklogId}"
            }`;
        }

        const query = `{
            timer_v2(
                where: { 
                    user_id: { _eq: "${userId}" } 
                    ${jiraQuery}
                }, 
                order_by: {
                    created_at: desc
                }, 
                limit: 1
            ) {
                id
                issue
                start_datetime
                end_datetime
                project {
                    id
                    name
                    project_color {
                        id
                        name
                    }
                }
                user {
                    id
                    email
                }
            }
        }
        `;

        let timer: Timer = null;

        return new Promise((resolve, reject) => {
            this.httpRequestsService.request(query).subscribe(
                (res: AxiosResponse) => {
                    const data = res.data.timer_v2.shift();

                    if (data) {
                        const {
                            id,
                            issue,
                            start_datetime: startDatetime,
                            end_datetime: endDatetime,
                            project,
                            user,
                        } = data;

                        const { id: projectId, name: projectName, project_color: projectColor } = project;
                        const { id: projectColorId, name: projectColorName } = projectColor;
                        const { id: userId, email: userEmail } = user;
                        timer = {
                            id,
                            issue,
                            startDatetime,
                            endDatetime,
                            project: {
                                id: projectId,
                                name: projectName,
                                projectColor: {
                                    id: projectColorId,
                                    name: projectColorName,
                                },
                            },
                            user: {
                                id: userId,
                                email: userEmail,
                            },
                        };
                    }

                    return resolve(timer);
                },
                _ => reject(timer)
            );
        });
    }

    addTimer(data: {
        issue: string;
        startDatetime: string;
        endDatetime: string;
        userId: string;
        projectId: string;
        jiraWorklogId?: number;
        syncJiraStatus?: boolean;
        title?: string;
    }): Promise<Timer | null> {
        let { issue } = data;
        issue = issue || 'Untitled issue';

        const {
            startDatetime,
            endDatetime,
            userId,
            projectId,
            jiraWorklogId = null,
            syncJiraStatus = false,
            title,
        } = data;

        const query = `mutation {
            insert_timer_v2(
                objects: [
                    {
                        issue: "${issue}",
                        title: "${title.replace(/"/g, '\\"')}",
                        start_datetime: "${startDatetime}",
                        end_datetime: "${endDatetime}",
                        user_id: "${userId}"
                        project_id: "${projectId}"
                        sync_jira_status: "${syncJiraStatus}"
                        jira_worklog_id: ${jiraWorklogId ? '"' + jiraWorklogId + '"' : null}
                    }
                ]
            ){
                returning {
                    id
                }
            }
        }
        `;

        return new Promise((resolve, reject) => {
            this.httpRequestsService.request(query).subscribe(
                _ => {
                    this.getTimer(userId)
                        .then((res: Timer) => resolve(res), _ => reject(null))
                        .catch(_ => reject(null));
                },
                _ => {
                    this.getTimer(userId)
                        .then((res: Timer) => resolve(res), _ => reject(null))
                        .catch(_ => reject(null));
                }
            );
        });
    }

    getUserTimerList(
        userId: string,
        params: { page?: string; limit?: string; startDateTime?: string; endDateTime?: string; searchValue?: string },
        plan?: string
    ) {
        const getCurrentTeamQuery = `{
            user_team(where: { 
                user_id: { _eq: "${userId}" }, 
                current_team: { _eq: true} 
            }) {
                team {
                    id
                    name
                }
            }
        }`;

        let { page, limit, startDateTime, endDateTime, searchValue } = params;
        let amountQuery = '';
        let dateRangeQuery = '';
        let searchQuery = '';

        if (page && limit) {
            const offset = +page === 1 ? 0 : +limit * (+page - 1);
            amountQuery = `limit: ${limit}, offset: ${offset}`;
        }

        if (startDateTime && endDateTime) {
            dateRangeQuery = `start_datetime: {_gte: "${startDateTime}", _lte: "${endDateTime}"}`;
        }

        if (searchValue) {
            searchQuery = `title: {_ilike: "%${searchValue
                .toLowerCase()
                .trim()
                .replace(/"/g, '\\"')}%"}`;
        }

        // TODO: Expand with Free and Pro limited
        const datelimit = plan ? this.timeService.getDonutDateLimited() : '';

        return new Promise((resolve, reject) => {
            this.httpRequestsService.request(getCurrentTeamQuery).subscribe(
                (getCurrentTeamRes: AxiosResponse) => {
                    let teamId = '';

                    // @TODO: HOTFIX. cause 502 error code on PROD
                    try {
                        teamId = getCurrentTeamRes.data.user_team[0].team.id;
                    } catch (e) {
                        console.log(e);
                    }

                    const variables: any = {
                        where: {
                            user_id: {
                                _eq: userId,
                            },
                            project: {
                                team_id: {
                                    _eq: teamId,
                                },
                            },
                        },
                    };

                    if (startDateTime && endDateTime) {
                        variables.where.start_datetime = {
                            _gte: startDateTime,
                            _lte: endDateTime,
                        };
                    }

                    if (searchValue) {
                        variables.where.title = {
                            _ilike: `%${searchValue
                                .toLowerCase()
                                .trim()
                                .replace(/%/g, '\\%')}%`,
                        };
                    }

                    if (datelimit) {
                        variables.where.start_datetime = {
                            _gte: datelimit,
                        };
                    }

                    const query = `query timer($where: timer_v2_bool_exp){ 
                        timer_v2( where: $where, order_by: {start_datetime: desc}, ${amountQuery})
                        {
                            id,
                            start_datetime,
                            end_datetime,
                            issue,
                            sync_jira_status,
                            project {
                                name,
                                id,
                                project_color {
                                    name
                                }
                            }
                        }
                    }`;

                    this.httpRequestsService
                        .graphql(query, variables)
                        .subscribe((res: AxiosResponse) => resolve(res), (error: AxiosError) => reject(error));
                },
                (getCurrentTeamError: AxiosError) => reject(getCurrentTeamError)
            );
        });
    }

    getReportsTimerList(
        teamId: string,
        userEmails: string[],
        projectNames: string[],
        startDate: string,
        endDate: string,
        plan?: string
    ) {
        const userWhereStatement = userEmails.length
            ? `user: {email: {_in: [${userEmails.map(userEmail => `"${userEmail}"`).join(',')}]}}`
            : '';

        const projectWhereStatement = projectNames.length
            ? `project: {
                team_id: {_eq: "${teamId}"},
                name: {_in: [${projectNames.map(projectName => `"${projectName}"`).join(',')}]}
            }`
            : `project: {team_id: {_eq: "${teamId}"}}`;

        const timerStatementArray = [
            `_or: [
            {start_datetime: {_gte: "${startDate}", _lte: "${endDate}"}},
            {end_datetime: {_gte: "${startDate}", _lte: "${endDate}"}},
            {start_datetime: {_lt: "${startDate}"}, end_datetime: {_gt: "${endDate}"}}
        ]`,
        ];

        if (userWhereStatement) {
            timerStatementArray.push(userWhereStatement);
        }

        timerStatementArray.push(projectWhereStatement);

        // TODO: Expand with Free and Pro limited
        const datelimit = plan ? this.timeService.getDonutDateLimited() : '';

        let where = `where: {${timerStatementArray.join(',')}}`;

        if (datelimit) {
            where = `where: {${timerStatementArray.join(',')}, 
            start_datetime: {_gte: "${datelimit}"},
        }`;
        }

        const query = `{
            timer_v2(${where}, order_by: {start_datetime: asc}) {
                start_datetime
                end_datetime
            }
        }`;

        return new Promise((resolve, reject) => {
            this.httpRequestsService.request(query).subscribe(
                (res: AxiosResponse) => {
                    this.limitTimeEntriesByStartEndDates(res.data.timer_v2, startDate, endDate);

                    const datePeriods = this.timeService.getDayPeriodsBetweenStartEndDates(startDate, endDate);
                    res.data.timer_v2 = this.cutTimeEntriesPartsByDatePeriods(res.data.timer_v2, datePeriods);

                    return resolve(res);
                },
                (error: AxiosError) => reject(error)
            );
        });
    }

    updateTimerById(userId: string, timerId: string, timer: Timer) {
        const { issue, projectId, startDatetime, endDatetime } = timer;

        const setParams = [`issue: "${issue || ''}"`, `project_id: "${projectId}"`];

        if (startDatetime) {
            setParams.push(`start_datetime: "${startDatetime}"`);
        }

        if (endDatetime) {
            setParams.push(`end_datetime: "${endDatetime}"`);
        }
        if (issue) {
            setParams.push(`title: "${decodeURI(issue).replace(/"/g, '\\"')}"`);
        }

        const getTimerQuery = `{
            timer_v2(where: {id: {_eq: "${timerId}"}}) {
                id
                user {
                    id
                }
            }
        }
        `;

        const updateTimerQuery = `mutation {
            update_timer_v2(
                where: {id: {_eq: "${timerId}"}},
                _set: {${setParams.join(', ')}}
            ) {
                returning {
                    id
                }
            }
        }
        `;

        return new Promise((resolve, reject) => {
            this.httpRequestsService.request(getTimerQuery).subscribe(
                (getTimerQueryRes: AxiosResponse) => {
                    const timer = getTimerQueryRes.data.timer_v2[0];
                    if (!timer) {
                        return reject({
                            message: 'ERROR.TIMER.UPDATE_FAILED',
                        });
                    }

                    const timerUserId = timer.user.id;
                    if (timerUserId !== userId) {
                        return reject({
                            message: 'ERROR.TIMER.UPDATE_FAILED',
                        });
                    }

                    this.httpRequestsService
                        .request(updateTimerQuery)
                        .subscribe(
                            (updateTimerQueryRes: AxiosResponse) => resolve(updateTimerQueryRes),
                            (updateTimerQueryError: AxiosError) => reject(updateTimerQueryError)
                        );
                },
                (getTimerQueryError: AxiosError) => reject(getTimerQueryError)
            );
        });
    }

    deleteTimerById(userId: string, timerId: string) {
        const getTimerQuery = `{
            timer_v2(where: {id: {_eq: "${timerId}"}}) {
                id
                user {
                    id
                }
            }
        }
        `;

        const deleteTimerQuery = `mutation {
            delete_timer_v2(where: {id: {_eq: "${timerId}"}}) {
                affected_rows
            }
        }
        `;

        return new Promise((resolve, reject) => {
            this.httpRequestsService.request(getTimerQuery).subscribe(
                (getTimerQueryRes: AxiosResponse) => {
                    const timer = getTimerQueryRes.data.timer_v2[0];
                    if (!timer) {
                        return reject({
                            message: 'ERROR.TIMER.DELETE_FAILED',
                        });
                    }

                    const timerUserId = timer.user.id;
                    if (timerUserId !== userId) {
                        return reject({
                            message: 'ERROR.TIMER.DELETE_FAILED',
                        });
                    }

                    this.httpRequestsService
                        .request(deleteTimerQuery)
                        .subscribe(
                            (deleteTimerQueryRes: AxiosResponse) => resolve(deleteTimerQueryRes),
                            (deleteTimerQueryError: AxiosError) => reject(deleteTimerQueryError)
                        );
                },
                (getTimerQueryError: AxiosError) => reject(getTimerQueryError)
            );
        });
    }

    limitTimeEntriesByStartEndDates(timeEntries: any[], startDate: string, endDate: string) {
        for (let i = 0; i < timeEntries.length; i++) {
            const timeEntry = timeEntries[i];
            this.limitTimeEntryByStartEndDates(timeEntry, startDate, endDate);
        }
    }

    limitTimeEntryByStartEndDates(timeEntry: any, startDate: string, endDate: string) {
        if (
            this.timeService.getTimestampByGivenValue(timeEntry.start_datetime) <
            this.timeService.getTimestampByGivenValue(startDate)
        ) {
            timeEntry.start_datetime = startDate;
        }

        if (
            this.timeService.getTimestampByGivenValue(timeEntry.end_datetime) >
            this.timeService.getTimestampByGivenValue(endDate)
        ) {
            timeEntry.end_datetime = endDate;
        }
    }

    cutTimeEntriesPartsByDatePeriods(timeEntries: any[], datePeriods: any[]): any[] {
        const timeEntriesPartsByDatePeriods = [];
        for (let i = 0; i < timeEntries.length; i++) {
            const timeEntry = timeEntries[i];
            for (let j = 0; j < datePeriods.length; j++) {
                const period = datePeriods[j];
                const timeEntryPart = this.cutTimeEntryPartBetweenStartEndDates(
                    {
                        start_datetime: timeEntry.start_datetime,
                        end_datetime: timeEntry.end_datetime,
                    },
                    period.startPeriod,
                    period.endPeriod
                );

                if (timeEntryPart) {
                    timeEntriesPartsByDatePeriods.push(timeEntryPart);
                }
            }
        }

        return timeEntriesPartsByDatePeriods;
    }

    cutTimeEntryPartBetweenStartEndDates(timeEntry: any, startDate: string, endDate: string): any {
        if (
            this.timeService.getTimestampByGivenValue(timeEntry.start_datetime) >
            this.timeService.getTimestampByGivenValue(endDate)
        ) {
            return null;
        }

        if (
            this.timeService.getTimestampByGivenValue(timeEntry.end_datetime) <
            this.timeService.getTimestampByGivenValue(startDate)
        ) {
            return null;
        }

        this.limitTimeEntryByStartEndDates(timeEntry, startDate, endDate);

        return timeEntry;
    }

    async getTimersWithoutTitle(): Promise<Timer[] | null> {
        const query = `{
            timer_v2(where: {title: {_is_null: true}}) {
                id
                issue
                title
              }
        }`;

        return new Promise((resolve, reject) => {
            this.httpRequestsService
                .request(query)
                .subscribe((res: AxiosResponse) => resolve(res.data.timer_v2), (error: AxiosError) => reject(error));
        });
    }

    async setTimerTitleFromIssue(id: string, title: string): Promise<Timer | null> {
        const variables = {
            where: {
                id: {
                    _eq: id,
                },
            },
            _set: {
                title,
            },
        };
        const mutation = `
        mutation updateTimer($where: timer_v2_bool_exp!, $_set: timer_v2_set_input) {
            update_timer_v2(_set: $_set, where: $where) {
              returning {
                id
                issue
                title
              }
            }
          }
        `;

        return new Promise((resolve, reject) => {
            this.httpRequestsService.graphql(mutation, variables).subscribe(
                (res: AxiosResponse) => resolve(res.data.update_timer_v2.returning[0]),
                (error: AxiosError) => {
                    console.log(error.response.data);
                    reject(error);
                }
            );
        });
    }
}
