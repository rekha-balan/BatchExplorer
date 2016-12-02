import { DecoratorBase } from "../../utils/decorators";
import { TaskConstraints } from "../taskConstraints";

export class TaskConstraintsDecorator extends DecoratorBase<TaskConstraints> {
    public maxWallClockTime: string;
    public maxTaskRetryCount: string;
    public retentionTime: string;

    constructor(private constraints: TaskConstraints) {
        super(constraints);

        this.maxWallClockTime = this.timespanField(constraints.maxWallClockTime);
        this.maxTaskRetryCount = this.stringField(constraints.maxTaskRetryCount);
        this.retentionTime = this.timespanField(constraints.retentionTime);
    }
}
