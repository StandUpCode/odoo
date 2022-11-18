/** @odoo-module **/

import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { parseFloatTime } from "@web/views/fields/parsers";
import { useInputField } from "@web/views/fields/input_field_hook";
import { standardFieldProps } from "@web/views/fields/standard_field_props";

const { Component, useState, onWillUpdateProps, onWillStart, onWillDestroy } = owl;

export function formatMinutes(value) {
    if (value === false) {
        return "";
    }
    const isNegative = value < 0;
    if (isNegative) {
        value = Math.abs(value);
    }
    let min = Math.floor(value);
    let sec = Math.floor((value % 1) * 60);
    sec = `${sec}`.padStart(2, "0");
    min = `${min}`.padStart(2, "0");
    return `${isNegative ? "-" : ""}${min}:${sec}`;
}

export class MrpTimer extends Component {
    setup() {
        this.orm = useService('orm');
        this.state = useState({
            // duration is expected to be given in minutes
            duration:
                this.props.value !== undefined ? this.props.value : this.props.record.data.duration,
        });
        this.lastDateTime = Date.now();
        useInputField({
            getValue: () => this.durationFormatted,
            refName: "numpadDecimal",
            parse: (v) => parseFloatTime(v),
        });

        this.ongoing =
            this.props.ongoing !== undefined
                ? this.props.ongoing
                : this.props.record.data.is_user_working;

        onWillStart(async () => {
            if(this.props.ongoing === undefined && !this.props.record.model.useSampleModel && this.props.record.data.state == "progress") {
                const additionalDuration = await this.orm.call('mrp.workorder', 'get_working_duration', [this.props.record.resId]);
                this.state.duration += additionalDuration;
            }
            if (this.ongoing) {
                this._runTimer();
                this._runSleepTimer();
            }
        });
        onWillUpdateProps((nextProps) => {
            const newOngoing =
                "ongoing" in nextProps
                    ? nextProps.ongoing
                    : "record" in nextProps && nextProps.record.data.is_user_working;
            const rerun = !this.ongoing && newOngoing;
            this.ongoing = newOngoing;
            if (rerun) {
                this.state.duration = nextProps.value;
                this._runTimer();
                this._runSleepTimer()
            }
        });
        onWillDestroy(() => clearTimeout(this.timer));
    }

    get durationFormatted() {
        if(this.props.value != this.state.duration && this.props.record && this.props.record.isDirty){
            this.state.duration = this.props.value;
        }
        return formatMinutes(this.state.duration);
    }

    _runTimer() {
        this.timer = setTimeout(() => {
            if (this.ongoing) {
                this.state.duration += 1 / 60;
                this._runTimer();
            }
        }, 1000);
    }

    //updates the time when the computer wakes from sleep mode
    _runSleepTimer() {
        this.timer = setTimeout(async () => {
            let diff = Date.now() - this.lastDateTime - 10000;
            if (diff > 1000) {
                this.state.duration += diff / (1000 * 60);
            }
            this.lastDateTime = Date.now();
            this._runSleepTimer();
        }, 10000);
    }
}

MrpTimer.props = {
    ...standardFieldProps,
    duration: { type: Number, optional: true },
    ongoing: { type: Boolean, optional: true },
    value: { optional: true },
};
MrpTimer.template = "mrp.MrpTimer";

export const mrpTimer = {
    component: MrpTimer,
    supportedTypes: ["float"],
};

registry.category("fields").add("mrp_timer", mrpTimer);
registry.category("formatters").add("mrp_timer", formatMinutes);